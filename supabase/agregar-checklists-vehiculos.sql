-- AGREGAR LA PESTAÑA "VEHÍCULOS" A LOS CHECKLISTS
-- Ejecutar en el SQL Editor de Supabase, después de agregar-checklists.sql.
--
-- Hasta ahora los checklists tenían 3 listas: Máquinas, Equipamiento y
-- Herramientas. Esto suma una cuarta, "Vehículos", para que las autobombas y
-- demás unidades de Flota no se mezclen con las máquinas (motobombas,
-- generadores, etc.).
-- ============================================================

-- 1) Permitir la categoría nueva. Se busca la restricción de categoría por
--    lo que controla (no por el nombre) para que funcione siempre.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.checklist_items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.checklist_items drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.checklist_items
  add constraint checklist_items_category_check
  check (category in ('vehiculos', 'maquinas', 'equipamiento', 'herramientas'));

-- 2) Si algún vehículo de Flota ya se había traído a "Máquinas", pasarlo a
--    "Vehículos" (solo los que se llaman igual que un vehículo de Flota).
update public.checklist_items ci
set category = 'vehiculos'
where ci.category = 'maquinas'
  and exists (
    select 1
    from public.vehicles v
    where v.organization_id = ci.organization_id
      and lower(trim(v.name)) = lower(trim(ci.name))
  )
  and not exists (
    select 1
    from public.checklist_items other
    where other.organization_id = ci.organization_id
      and other.category = 'vehiculos'
      and other.name = ci.name
  );

notify pgrst, 'reload schema';
