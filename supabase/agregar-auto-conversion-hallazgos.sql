-- CONVERSIÓN AUTOMÁTICA DE HALLAZGO A ORDEN DE MANTENIMIENTO
-- Al insertar un hallazgo (lo puede hacer cualquier bombero), se crea
-- automáticamente la orden de mantenimiento vinculada, sin necesidad de
-- que admin/guardia toquen ningún botón. Usa SECURITY DEFINER para poder
-- escribir en maintenance_records aunque quien reportó sea un bombero
-- (que no tiene permiso directo de escritura en esa tabla).
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

create or replace function public.auto_create_maintenance_from_finding()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_order_id uuid;
begin
  insert into public.maintenance_records (
    organization_id, vehicle_id, type, work, created_by
  ) values (
    new.organization_id, new.vehicle_id, 'correctivo', new.description, new.reported_by
  )
  returning id into new_order_id;

  update public.maintenance_findings
  set status = 'convertido', converted_maintenance_id = new_order_id
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_auto_create_maintenance on public.maintenance_findings;
create trigger trg_auto_create_maintenance
after insert on public.maintenance_findings
for each row execute procedure public.auto_create_maintenance_from_finding();
