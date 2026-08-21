-- LIBRO DE GUARDIA: llamadas, proveedores/visitas, vehículos, movimientos y agenda
-- Ejecutar en el SQL Editor de Supabase, en partes si hace falta.
-- ============================================================

-- ---------- Llamadas ----------
create table if not exists public.guard_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  caller_name text,
  caller_phone text,
  reason text,
  derived_to text,
  taken_by uuid not null references public.profiles(id),
  notes text,
  status text not null default 'abierta' check (status in ('abierta','derivada','cerrada')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists guard_calls_org_idx
  on public.guard_calls(organization_id, created_at desc);

alter table public.guard_calls enable row level security;

drop policy if exists "guard_calls_staff" on public.guard_calls;
create policy "guard_calls_staff" on public.guard_calls
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
);

-- ---------- Proveedores y visitas ----------
create table if not exists public.guard_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  visitor_name text not null,
  reason text,
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  notes text,
  registered_by uuid not null references public.profiles(id)
);

create index if not exists guard_visits_org_idx
  on public.guard_visits(organization_id, entered_at desc);

alter table public.guard_visits enable row level security;

drop policy if exists "guard_visits_staff" on public.guard_visits;
create policy "guard_visits_staff" on public.guard_visits
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
);

-- ---------- Vehículos (base para movimientos) ----------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  type text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;

drop policy if exists "vehicles_read" on public.vehicles;
create policy "vehicles_read" on public.vehicles
for select to authenticated
using (organization_id = public.current_profile_org_id());

drop policy if exists "vehicles_write_admin" on public.vehicles;
create policy "vehicles_write_admin" on public.vehicles
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() = 'admin'
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() = 'admin'
);

-- ---------- Movimientos de vehículos ----------
create table if not exists public.vehicle_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  vehicle_id uuid not null references public.vehicles(id),
  reason text not null default 'otro' check (
    reason in ('emergencia','mantenimiento','capacitacion','tramite','abastecimiento','otro')
  ),
  driver_id uuid references public.profiles(id),
  companions text,
  departed_at timestamptz not null default now(),
  departure_km numeric,
  returned_at timestamptz,
  return_km numeric,
  notes text,
  registered_by uuid not null references public.profiles(id)
);

create index if not exists vehicle_movements_org_idx
  on public.vehicle_movements(organization_id, departed_at desc);

alter table public.vehicle_movements enable row level security;

drop policy if exists "vehicle_movements_staff" on public.vehicle_movements;
create policy "vehicle_movements_staff" on public.vehicle_movements
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
);

-- ---------- Agenda de Guardia ----------
create table if not exists public.agenda_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null,
  description text,
  event_at timestamptz not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists agenda_events_org_idx
  on public.agenda_events(organization_id, event_at);

alter table public.agenda_events enable row level security;

drop policy if exists "agenda_events_staff" on public.agenda_events;
create policy "agenda_events_staff" on public.agenda_events
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
    alter publication supabase_realtime add table public.guard_calls;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.guard_visits;
  exception when duplicate_object then null;
  end;
end $$;
