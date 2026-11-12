-- AGREGAR PUNTOS A REVISAR (PREGUNTAS) A CADA EQUIPO DE LOS CHECKLISTS
-- Ejecutar en el SQL Editor de Supabase, DESPUÉS de agregar-checklists.sql.
--
-- Cada equipo puede tener su propia lista de puntos a revisar (ej: "Nivel
-- de aceite", "Luces y balizas"). Esa lista es permanente: la arman y
-- modifican admin y jefatura, y no se borra al inspeccionar de nuevo.
--
-- Las respuestas (Sí / No / No aplica) de la última inspección se guardan
-- en el propio equipo (columna "answers"), así se pisan en cada inspección
-- o se limpian con el botón "Limpiar", sin acumular historial.
-- ============================================================

alter table public.checklist_items
  add column if not exists answers jsonb not null default '{}'::jsonb;

create table if not exists public.checklist_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  item_id uuid not null references public.checklist_items(id) on delete cascade,
  question text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists checklist_points_item_idx
  on public.checklist_points(item_id, sort_order);

alter table public.checklist_points enable row level security;

-- Cualquiera con sesión de la organización puede VER los puntos.
drop policy if exists "checklist_points_read" on public.checklist_points;
create policy "checklist_points_read" on public.checklist_points
for select to authenticated
using (organization_id = public.current_profile_org_id());

-- Solo admin y jefatura pueden agregar, editar, ordenar o eliminar puntos.
drop policy if exists "checklist_points_write" on public.checklist_points;
create policy "checklist_points_write" on public.checklist_points
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin', 'jefatura')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin', 'jefatura')
);

-- Para que la pantalla se actualice sola cuando otra persona hace cambios.
do $$
begin
  begin
    alter publication supabase_realtime add table public.checklist_items;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.checklist_points;
  exception when duplicate_object then null;
  end;
end $$;

notify pgrst, 'reload schema';
