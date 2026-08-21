-- HALLAZGOS DE MANTENIMIENTO (con foto)
-- Cualquier bombero puede reportar un problema. Admin/guardia lo revisan y
-- pueden convertirlo en una orden formal de mantenimiento.
-- Ejecutar en el SQL Editor de Supabase, en partes si hace falta.
-- ============================================================

-- ---------- Bucket de almacenamiento para las fotos ----------
insert into storage.buckets (id, name, public)
values ('maintenance-findings', 'maintenance-findings', true)
on conflict (id) do nothing;

drop policy if exists "maintenance_findings_photos_insert" on storage.objects;
create policy "maintenance_findings_photos_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'maintenance-findings');

drop policy if exists "maintenance_findings_photos_read" on storage.objects;
create policy "maintenance_findings_photos_read" on storage.objects
for select
using (bucket_id = 'maintenance-findings');

-- ---------- Tabla de hallazgos ----------
create table if not exists public.maintenance_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  vehicle_id uuid references public.vehicles(id),
  area text,
  description text not null,
  priority text not null default 'media' check (priority in ('baja','media','alta','critica')),
  photo_url text,
  status text not null default 'pendiente' check (status in ('pendiente','convertido','descartado')),
  reported_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  converted_maintenance_id uuid references public.maintenance_records(id)
);

create index if not exists maintenance_findings_org_idx
  on public.maintenance_findings(organization_id, status);

alter table public.maintenance_findings enable row level security;

-- Todos los miembros de la organización pueden LEER los hallazgos (así el
-- bombero ve el estado de lo que reportó, y admin/guardia ven todo).
drop policy if exists "maintenance_findings_read" on public.maintenance_findings;
create policy "maintenance_findings_read" on public.maintenance_findings
for select to authenticated
using (organization_id = public.current_profile_org_id());

-- Cualquier bombero autenticado puede REPORTAR (insertar) un hallazgo propio.
drop policy if exists "maintenance_findings_insert_any" on public.maintenance_findings;
create policy "maintenance_findings_insert_any" on public.maintenance_findings
for insert to authenticated
with check (
  organization_id = public.current_profile_org_id()
  and reported_by = auth.uid()
);

-- Solo admin/guardia pueden actualizar (cambiar estado, convertir a orden).
drop policy if exists "maintenance_findings_update_staff" on public.maintenance_findings;
create policy "maintenance_findings_update_staff" on public.maintenance_findings
for update to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (organization_id = public.current_profile_org_id());

do $$
begin
  begin
    alter publication supabase_realtime add table public.maintenance_findings;
  exception when duplicate_object then null;
  end;
end $$;
