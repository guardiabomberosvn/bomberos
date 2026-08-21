-- FLOTA + COMBUSTIBLE + MANTENIMIENTO
-- Ejecutar en el SQL Editor de Supabase, en partes si hace falta.
-- ============================================================

-- ---------- Vehículos: agregar estado y kilometraje ----------
alter table public.vehicles
  add column if not exists status text not null default 'disponible'
    check (status in ('disponible','servicio','mantenimiento','fuera_de_servicio'));

alter table public.vehicles
  add column if not exists km numeric not null default 0;

-- ---------- Combustible ----------
create table if not exists public.fuel_loads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  vehicle_id uuid not null references public.vehicles(id),
  loaded_at timestamptz not null default now(),
  liters numeric not null,
  km numeric,
  cost numeric,
  notes text,
  registered_by uuid not null references public.profiles(id)
);

create index if not exists fuel_loads_org_idx
  on public.fuel_loads(organization_id, loaded_at desc);

alter table public.fuel_loads enable row level security;

drop policy if exists "fuel_loads_staff" on public.fuel_loads;
create policy "fuel_loads_staff" on public.fuel_loads
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
);

-- ---------- Mantenimiento ----------
create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  vehicle_id uuid references public.vehicles(id),
  type text not null default 'preventivo' check (type in ('preventivo','correctivo','inspeccion')),
  work text not null,
  responsible text,
  target_date date,
  target_km numeric,
  status text not null default 'pendiente' check (status in ('pendiente','en_proceso','completado')),
  cost numeric,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists maintenance_records_org_idx
  on public.maintenance_records(organization_id, status);

alter table public.maintenance_records enable row level security;

drop policy if exists "maintenance_records_read" on public.maintenance_records;
create policy "maintenance_records_read" on public.maintenance_records
for select to authenticated
using (organization_id = public.current_profile_org_id());

drop policy if exists "maintenance_records_write_staff" on public.maintenance_records;
create policy "maintenance_records_write_staff" on public.maintenance_records
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.maintenance_records;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.vehicles;
  exception when duplicate_object then null;
  end;
end $$;
