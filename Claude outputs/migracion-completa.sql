-- ============================================================
-- MIGRACIÓN COMPLETA: estructura de la base de datos de Sistema
-- Bomberos, consolidada en un solo archivo para el proyecto nuevo
-- de Supabase. Pegar TODO este archivo en el SQL Editor y ejecutar
-- una sola vez.
-- ============================================================

-- SISTEMA BOMBEROS V1 (mejorado)
-- Ejecutar completo en Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  province text,
  created_at timestamptz not null default now()
);

insert into public.organizations (id, name, city, province)
values ('11111111-1111-1111-1111-111111111111', 'Cuartel Demo', 'Villa María', 'Córdoba')
on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  email text,
  full_name text not null default 'Bombero',
  legajo text,
  rank text,
  phone text,
  role text not null default 'bombero' check (role in ('admin','guardia','bombero')),
  is_active boolean not null default true,
  availability text not null default 'no_disponible' check (availability in ('disponible','no_disponible')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_org_idx on public.profiles(organization_id);
create index if not exists profiles_availability_idx on public.profiles(organization_id, availability);
create index if not exists profiles_role_idx on public.profiles(organization_id, role) where is_active;

-- Legajo único por cuartel (permite null, pero si se carga no puede repetirse en la misma org).
create unique index if not exists profiles_legajo_org_unique
  on public.profiles(organization_id, legajo) where legajo is not null;

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  firefighter_id uuid not null references public.profiles(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  type text not null default 'cuartel',
  notes text,
  created_at timestamptz not null default now(),
  constraint attendance_time_order check (checked_out_at is null or checked_out_at >= checked_in_at)
);

create index if not exists attendance_org_idx on public.attendance(organization_id, checked_in_at desc);
create index if not exists attendance_firefighter_idx on public.attendance(firefighter_id, checked_in_at desc);
create unique index if not exists attendance_one_open on public.attendance(firefighter_id) where checked_out_at is null;

-- Primer usuario = administrador. Los siguientes = bombero.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  first_user boolean;
begin
  select not exists(select 1 from public.profiles) into first_user;

  insert into public.profiles (
    id, organization_id, email, full_name, legajo, role
  ) values (
    new.id,
    '11111111-1111-1111-1111-111111111111',
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(coalesce(new.email, 'Bombero'), '@', 1)),
    nullif(new.raw_user_meta_data->>'legajo',''),
    case when first_user then 'admin' else 'bombero' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute procedure public.touch_updated_at();

-- Helpers de autorización. SECURITY DEFINER evita recursión de RLS al consultar el perfil actual.
create or replace function public.current_profile_org_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$ select organization_id from public.profiles where id = auth.uid() $$;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

-- Cuenta cuántos admins activos quedan en una organización (excluyendo opcionalmente un id).
create or replace function public.active_admin_count(org_id uuid, exclude_id uuid default null)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select count(*)::int
  from public.profiles
  where organization_id = org_id
    and role = 'admin'
    and is_active = true
    and (exclude_id is null or id <> exclude_id)
$$;

-- Evita que un usuario no-admin se otorgue permisos desde la consola del navegador,
-- y evita que un admin se auto-degrade/desactive si es el único admin activo del cuartel.
create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() = old.id then
    if public.current_profile_role() <> 'admin' then
      -- Un bombero/guardia solo puede tocar su disponibilidad.
      new.organization_id := old.organization_id;
      new.email := old.email;
      new.full_name := old.full_name;
      new.legajo := old.legajo;
      new.rank := old.rank;
      new.phone := old.phone;
      new.role := old.role;
      new.is_active := old.is_active;
    else
      -- Es admin editando su propio perfil: no puede sacarse el rol de admin
      -- ni desactivarse si es el único admin activo de la organización.
      if (new.role <> 'admin' or new.is_active = false)
         and public.active_admin_count(old.organization_id, old.id) = 0 then
        raise exception 'No podés quitarte el rol de administrador ni desactivarte: sos el único admin activo del cuartel.';
      end if;
      new.organization_id := old.organization_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_sensitive_fields on public.profiles;
create trigger profiles_protect_sensitive_fields
before update on public.profiles
for each row execute procedure public.protect_profile_sensitive_fields();

-- Restringe qué columnas puede tocar un bombero en su propio registro de asistencia:
-- solo puede fichar su salida (checked_out_at) y notas. No puede alterar la hora de
-- ingreso, el tipo, la organización ni reasignarse el registro a otra persona.
create or replace function public.protect_attendance_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.firefighter_id = auth.uid() and public.current_profile_role() = 'bombero' then
    new.organization_id := old.organization_id;
    new.firefighter_id := old.firefighter_id;
    new.checked_in_at := old.checked_in_at;
    new.type := old.type;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_protect_fields on public.attendance;
create trigger attendance_protect_fields
before update on public.attendance
for each row execute procedure public.protect_attendance_fields();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.attendance enable row level security;

drop policy if exists "organizations_read_own" on public.organizations;
create policy "organizations_read_own" on public.organizations
for select to authenticated
using (id = public.current_profile_org_id());

drop policy if exists "profiles_read_same_org" on public.profiles;
create policy "profiles_read_same_org" on public.profiles
for select to authenticated
using (organization_id = public.current_profile_org_id());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
for update to authenticated
using (
  id = auth.uid()
  or (organization_id = public.current_profile_org_id() and public.current_profile_role() = 'admin')
)
with check (
  organization_id = public.current_profile_org_id()
  and (
    id = auth.uid()
    or public.current_profile_role() = 'admin'
  )
);

drop policy if exists "attendance_read_same_org" on public.attendance;
create policy "attendance_read_same_org" on public.attendance
for select to authenticated
using (organization_id = public.current_profile_org_id());

-- Un bombero registra su propia asistencia; guardia/admin pueden registrar
-- asistencia de terceros de la misma organización (fichar a mano).
drop policy if exists "attendance_insert_self" on public.attendance;
create policy "attendance_insert_self_or_staff" on public.attendance
for insert to authenticated
with check (
  organization_id = public.current_profile_org_id()
  and (
    firefighter_id = auth.uid()
    or public.current_profile_role() in ('admin','guardia')
  )
);

drop policy if exists "attendance_update_self_or_admin" on public.attendance;
create policy "attendance_update_self_or_admin" on public.attendance
for update to authenticated
using (
  organization_id = public.current_profile_org_id()
  and (firefighter_id = auth.uid() or public.current_profile_role() in ('admin','guardia'))
)
with check (organization_id = public.current_profile_org_id());

-- ============================================================
-- MÓDULO DE EMERGENCIAS (simplificado)
-- ============================================================

create table if not exists public.emergencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null,
  address text,
  notes text,
  status text not null default 'activa' check (status in ('activa','cancelada','finalizada')),
  target text not null default 'todos' check (target in ('todos','individual')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancel_reason text
);

create index if not exists emergencies_org_idx on public.emergencies(organization_id, created_at desc);
create index if not exists emergencies_status_idx on public.emergencies(organization_id, status);

-- Destinatarios puntuales cuando target = 'individual'. Si target = 'todos',
-- esta tabla queda vacía y se entiende que aplica a todo el personal activo.
create table if not exists public.emergency_recipients (
  emergency_id uuid not null references public.emergencies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (emergency_id, profile_id)
);

create table if not exists public.emergency_responses (
  id uuid primary key default gen_random_uuid(),
  emergency_id uuid not null references public.emergencies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  response text not null check (response in ('acudo','no_acudo')),
  responded_at timestamptz not null default now(),
  unique (emergency_id, profile_id)
);

create index if not exists emergency_responses_emergency_idx on public.emergency_responses(emergency_id);

-- Devuelve true si el perfil dado es destinatario de la emergencia
-- (todo el cuerpo, o listado puntual en emergency_recipients).
create or replace function public.is_emergency_recipient(em_id uuid, prof_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.emergencies e
    where e.id = em_id
      and e.organization_id = public.current_profile_org_id()
      and (
        e.target = 'todos'
        or exists (
          select 1 from public.emergency_recipients r
          where r.emergency_id = em_id and r.profile_id = prof_id
        )
      )
  )
$$;

alter table public.emergencies enable row level security;
alter table public.emergency_recipients enable row level security;
alter table public.emergency_responses enable row level security;

-- Admin y guardia ven todas las emergencias de su organización.
-- Un bombero solo ve las que le corresponden como destinatario.
drop policy if exists "emergencies_read" on public.emergencies;
create policy "emergencies_read" on public.emergencies
for select to authenticated
using (
  organization_id = public.current_profile_org_id()
  and (
    public.current_profile_role() in ('admin','guardia')
    or public.is_emergency_recipient(id, auth.uid())
  )
);

drop policy if exists "emergencies_insert_staff" on public.emergencies;
create policy "emergencies_insert_staff" on public.emergencies
for insert to authenticated
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
  and created_by = auth.uid()
);

drop policy if exists "emergencies_update_staff" on public.emergencies;
create policy "emergencies_update_staff" on public.emergencies
for update to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (organization_id = public.current_profile_org_id());

drop policy if exists "emergency_recipients_read" on public.emergency_recipients;
create policy "emergency_recipients_read" on public.emergency_recipients
for select to authenticated
using (
  exists (
    select 1 from public.emergencies e
    where e.id = emergency_id and e.organization_id = public.current_profile_org_id()
  )
);

drop policy if exists "emergency_recipients_insert_staff" on public.emergency_recipients;
create policy "emergency_recipients_insert_staff" on public.emergency_recipients
for insert to authenticated
with check (
  public.current_profile_role() in ('admin','guardia')
  and exists (
    select 1 from public.emergencies e
    where e.id = emergency_id and e.organization_id = public.current_profile_org_id()
  )
);

drop policy if exists "emergency_responses_read" on public.emergency_responses;
create policy "emergency_responses_read" on public.emergency_responses
for select to authenticated
using (
  exists (
    select 1 from public.emergencies e
    where e.id = emergency_id and e.organization_id = public.current_profile_org_id()
  )
);

-- Un bombero solo puede insertar su propia respuesta, y solo si es destinatario
-- de una emergencia activa.
drop policy if exists "emergency_responses_insert_self" on public.emergency_responses;
create policy "emergency_responses_insert_self" on public.emergency_responses
for insert to authenticated
with check (
  profile_id = auth.uid()
  and exists (
    select 1 from public.emergencies e
    where e.id = emergency_id
      and e.organization_id = public.current_profile_org_id()
      and e.status = 'activa'
  )
  and public.is_emergency_recipient(emergency_id, auth.uid())
);

drop policy if exists "emergency_responses_update_self" on public.emergency_responses;
create policy "emergency_responses_update_self" on public.emergency_responses
for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

-- Realtime para dashboard y asistencia. Si ya estaban agregadas, el bloque no falla.
do $$
begin
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.attendance;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.emergencies;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.emergency_responses;
  exception when duplicate_object then null;
  end;
end $$;
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
-- TURNO DE GUARDIA
-- El guardia que llega a trabajar "abre turno" al empezar, y lo "cierra"
-- cuando se va. Solo puede haber un turno abierto por vez en cada cuartel.
-- Los módulos de Libro de Guardia (Llamadas, y los que se agreguen después)
-- van a ir enganchando sus registros al turno que esté abierto en ese momento.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.guard_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  opened_by uuid not null references public.profiles(id),
  opened_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  notes text
);

create index if not exists guard_shifts_org_idx
  on public.guard_shifts(organization_id, opened_at desc);

-- Solo un turno abierto por vez, por cuartel.
create unique index if not exists guard_shifts_one_open
  on public.guard_shifts(organization_id) where closed_at is null;

alter table public.guard_shifts enable row level security;

drop policy if exists "guard_shifts_staff" on public.guard_shifts;
create policy "guard_shifts_staff" on public.guard_shifts
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
);

-- Enganchamos Llamadas al turno abierto (opcional: puede ser null en
-- registros viejos o si nadie abrió turno).
alter table public.guard_calls
  add column if not exists shift_id uuid references public.guard_shifts(id);

do $$
begin
  begin
    alter publication supabase_realtime add table public.guard_shifts;
  exception when duplicate_object then null;
  end;
end $$;
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
-- INTERVENCIONES
-- Registro del servicio completo: fecha/hora, unidades participantes,
-- personal a cargo, operador, observaciones. Opcionalmente vinculada a
-- una emergencia del módulo de Emergencias.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.interventions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  emergency_id uuid references public.emergencies(id),
  title text not null,
  occurred_at timestamptz not null default now(),
  personnel_in_charge text,
  operator_id uuid references public.profiles(id),
  observations text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists interventions_org_idx
  on public.interventions(organization_id, occurred_at desc);

alter table public.interventions enable row level security;

drop policy if exists "interventions_read" on public.interventions;
create policy "interventions_read" on public.interventions
for select to authenticated
using (organization_id = public.current_profile_org_id());

drop policy if exists "interventions_write_staff" on public.interventions;
create policy "interventions_write_staff" on public.interventions
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
);

-- Unidades que participaron de la intervención.
create table if not exists public.intervention_units (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id),
  driver_id uuid references public.profiles(id),
  departed_at timestamptz,
  returned_at timestamptz,
  km_out numeric,
  km_in numeric
);

alter table public.intervention_units enable row level security;

drop policy if exists "intervention_units_read" on public.intervention_units;
create policy "intervention_units_read" on public.intervention_units
for select to authenticated
using (
  exists (
    select 1 from public.interventions i
    where i.id = intervention_id and i.organization_id = public.current_profile_org_id()
  )
);

drop policy if exists "intervention_units_write_staff" on public.intervention_units;
create policy "intervention_units_write_staff" on public.intervention_units
for all to authenticated
using (
  public.current_profile_role() in ('admin','guardia')
  and exists (
    select 1 from public.interventions i
    where i.id = intervention_id and i.organization_id = public.current_profile_org_id()
  )
)
with check (
  public.current_profile_role() in ('admin','guardia')
  and exists (
    select 1 from public.interventions i
    where i.id = intervention_id and i.organization_id = public.current_profile_org_id()
  )
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.interventions;
  exception when duplicate_object then null;
  end;
end $$;
-- AVISOS A OTRAS FUERZAS O SERVICIOS
-- Digitaliza el cuaderno AVISOS_A_OTRAS_FUERZAS.xlsx: registro de llamados
-- hechos a otras fuerzas/servicios (Policía, EPEC, Tránsito, etc).
--
-- IMPORTANTE: requiere haber corrido antes agregar-turno-guardia.sql
-- (crea la tabla guard_shifts que se referencia acá abajo).
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.other_force_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  service_name text not null,
  called_at timestamptz not null default now(),
  code text,
  cause text not null,
  address text,
  locality text,
  received_by_name text,
  taken_by uuid references public.profiles(id),
  shift_id uuid references public.guard_shifts(id),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists other_force_notices_org_idx
  on public.other_force_notices(organization_id, called_at desc);

alter table public.other_force_notices enable row level security;

drop policy if exists "other_force_notices_staff" on public.other_force_notices;
create policy "other_force_notices_staff" on public.other_force_notices
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
    alter publication supabase_realtime add table public.other_force_notices;
  exception when duplicate_object then null;
  end;
end $$;
-- CONTROL DE STOCK (mercadería e insumos)
-- Digitaliza Control_stock_mercaderia_e_insumos.xlsx: catálogo de insumos
-- con su stock inicial/cargado, y un registro de retiros que descuenta
-- automáticamente del stock disponible.
--
-- IMPORTANTE: requiere haber corrido antes agregar-turno-guardia.sql
-- (crea la tabla guard_shifts que se referencia acá abajo).
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- ---------- Insumos (catálogo + stock inicial/cargado) ----------
create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  unit text not null default 'unidades',
  initial_stock numeric not null default 0,
  min_stock numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_items_org_idx
  on public.stock_items(organization_id, name);

alter table public.stock_items enable row level security;

drop policy if exists "stock_items_staff" on public.stock_items;
create policy "stock_items_staff" on public.stock_items
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
);

-- ---------- Registro de retiros (descuenta del stock) ----------
create table if not exists public.stock_withdrawals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  item_id uuid not null references public.stock_items(id),
  quantity numeric not null check (quantity > 0),
  withdrawn_at timestamptz not null default now(),
  operator_id uuid references public.profiles(id),
  withdrawn_by text,
  destination text,
  notes text,
  shift_id uuid references public.guard_shifts(id)
);

create index if not exists stock_withdrawals_org_idx
  on public.stock_withdrawals(organization_id, withdrawn_at desc);
create index if not exists stock_withdrawals_item_idx
  on public.stock_withdrawals(item_id);

alter table public.stock_withdrawals enable row level security;

drop policy if exists "stock_withdrawals_staff" on public.stock_withdrawals;
create policy "stock_withdrawals_staff" on public.stock_withdrawals
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
    alter publication supabase_realtime add table public.stock_items;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.stock_withdrawals;
  exception when duplicate_object then null;
  end;
end $$;
-- ASISTENCIA: SOLO ADMIN GESTIONA A TERCEROS DESDE PC
-- El bombero, en su celular, sólo usa el QR para entrar/salir.
-- Guardia deja de poder cargar/cerrar asistencia de otros (sólo Admin).
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

drop policy if exists "attendance_insert_self_or_staff" on public.attendance;
create policy "attendance_insert_self_or_admin" on public.attendance
for insert to authenticated
with check (
  organization_id = public.current_profile_org_id()
  and (
    firefighter_id = auth.uid()
    or public.current_profile_role() = 'admin'
  )
);

drop policy if exists "attendance_update_self_or_admin" on public.attendance;
create policy "attendance_update_self_or_admin" on public.attendance
for update to authenticated
using (
  organization_id = public.current_profile_org_id()
  and (firefighter_id = auth.uid() or public.current_profile_role() = 'admin')
)
with check (organization_id = public.current_profile_org_id());

-- El trigger que protege campos sensibles de asistencia ya sólo limitaba a
-- 'bombero'; lo dejamos igual (guardia ya no tiene policy para tocar
-- terceros, así que no hace falta ajustar el trigger).
-- EMERGENCIAS CON/SIN CONVOCATORIA
-- Permite que una alerta sea solo informativa (sin pedir ACUDO/NO ACUDO)
-- o de convocatoria real (con botones de respuesta).
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

alter table public.emergencies
  add column if not exists needs_response boolean not null default true;
-- AGREGAR QR DE ASISTENCIA POR CONSOLA
-- Ejecutar este archivo UNA VEZ en el SQL Editor de Supabase si ya tenías
-- el schema.sql y agregar-emergencias.sql corridos. Seguro de re-ejecutar.
-- ============================================================

-- Sesión de QR generada por Guardia/Admin desde la consola. El bombero
-- escanea el "token" con su celular; el backend valida que esté vigente
-- y registra ingreso o egreso según corresponda.
create table if not exists public.attendance_qr_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  token uuid not null default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists attendance_qr_sessions_token_idx
  on public.attendance_qr_sessions(token);
create index if not exists attendance_qr_sessions_org_idx
  on public.attendance_qr_sessions(organization_id, expires_at desc);

alter table public.attendance_qr_sessions enable row level security;

-- Solo staff puede generar/ver sesiones QR de su organización.
drop policy if exists "qr_sessions_staff" on public.attendance_qr_sessions;
create policy "qr_sessions_staff" on public.attendance_qr_sessions
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
  and created_by = auth.uid()
);

-- Cualquier autenticado de la misma organización puede LEER si un token es
-- válido (necesario para que el bombero valide el QR que escaneó), pero
-- solo ve el id/expiración, no puede generarlos ni modificarlos.
drop policy if exists "qr_sessions_read_valid" on public.attendance_qr_sessions;
create policy "qr_sessions_read_valid" on public.attendance_qr_sessions
for select to authenticated
using (organization_id = public.current_profile_org_id());

-- Función que registra ingreso/egreso del bombero autenticado a partir de
-- un token de QR vigente. SECURITY DEFINER porque el bombero no tiene
-- permiso directo para leer si el token existe más allá de su propia fila.
create or replace function public.checkin_with_qr(qr_token uuid)
returns table(action text, checked_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  session_org uuid;
  my_id uuid := auth.uid();
  my_org uuid;
  open_id uuid;
begin
  select organization_id into session_org
  from public.attendance_qr_sessions
  where token = qr_token and expires_at > now();

  if session_org is null then
    raise exception 'QR inválido o vencido';
  end if;

  select organization_id into my_org from public.profiles where id = my_id;

  if my_org is null or my_org <> session_org then
    raise exception 'Este QR no corresponde a tu cuartel';
  end if;

  select id into open_id
  from public.attendance
  where firefighter_id = my_id and checked_out_at is null;

  if open_id is not null then
    update public.attendance
    set checked_out_at = now()
    where id = open_id;
    return query select 'salida'::text, now();
  else
    insert into public.attendance (organization_id, firefighter_id, type, notes)
    values (my_org, my_id, 'cuartel', 'Registrado por QR de consola')
    returning 'ingreso'::text, checked_in_at into action, checked_at;
    return next;
  end if;
end;
$$;

-- Realtime para la sesión QR (así la consola detecta escaneos al instante
-- si en el futuro se quiere mostrar feedback en vivo).
do $$
begin
  begin
    alter publication supabase_realtime add table public.attendance_qr_sessions;
  exception when duplicate_object then null;
  end;
end $$;
-- ARREGLO: la tabla attendance_qr_sessions quedó con una columna vieja
-- (session_type NOT NULL) de un intento anterior, que rompe la generación
-- del QR. La recreamos limpia. No tiene datos importantes (son sesiones
-- de QR temporales de 45 segundos), así que es seguro borrarla.

drop table if exists public.attendance_qr_sessions cascade;

create table public.attendance_qr_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  token uuid not null default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index attendance_qr_sessions_token_idx
  on public.attendance_qr_sessions(token);
create index attendance_qr_sessions_org_idx
  on public.attendance_qr_sessions(organization_id, expires_at desc);

alter table public.attendance_qr_sessions enable row level security;

drop policy if exists "qr_sessions_staff" on public.attendance_qr_sessions;
create policy "qr_sessions_staff" on public.attendance_qr_sessions
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
  and created_by = auth.uid()
);

drop policy if exists "qr_sessions_read_valid" on public.attendance_qr_sessions;
create policy "qr_sessions_read_valid" on public.attendance_qr_sessions
for select to authenticated
using (organization_id = public.current_profile_org_id());

do $$
begin
  begin
    alter publication supabase_realtime add table public.attendance_qr_sessions;
  exception when duplicate_object then null;
  end;
end $$;
-- AGREGAR TIPOS DE EMERGENCIA (BOTONES) + GRUPOS DE CONVOCATORIA
-- Ejecutar una vez en el SQL Editor de Supabase, después de tener corridos
-- schema.sql, agregar-emergencias.sql y agregar-qr-asistencia.sql.
-- ============================================================

-- ---------- Tipos de emergencia (botones configurables por el admin) ----------
create table if not exists public.emergency_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  code text,
  color text not null default '#b91c1c',
  icon text not null default '🚨',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists emergency_types_org_idx
  on public.emergency_types(organization_id, sort_order);

alter table public.emergency_types enable row level security;

drop policy if exists "emergency_types_read" on public.emergency_types;
create policy "emergency_types_read" on public.emergency_types
for select to authenticated
using (organization_id = public.current_profile_org_id());

drop policy if exists "emergency_types_write_admin" on public.emergency_types;
create policy "emergency_types_write_admin" on public.emergency_types
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() = 'admin'
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() = 'admin'
);

-- ---------- Grupos de convocatoria ----------
create table if not exists public.dispatch_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists dispatch_groups_org_idx
  on public.dispatch_groups(organization_id);

create table if not exists public.dispatch_group_members (
  group_id uuid not null references public.dispatch_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (group_id, profile_id)
);

alter table public.dispatch_groups enable row level security;
alter table public.dispatch_group_members enable row level security;

drop policy if exists "dispatch_groups_read" on public.dispatch_groups;
create policy "dispatch_groups_read" on public.dispatch_groups
for select to authenticated
using (organization_id = public.current_profile_org_id());

drop policy if exists "dispatch_groups_write_admin" on public.dispatch_groups;
create policy "dispatch_groups_write_admin" on public.dispatch_groups
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() = 'admin'
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() = 'admin'
);

drop policy if exists "dispatch_group_members_read" on public.dispatch_group_members;
create policy "dispatch_group_members_read" on public.dispatch_group_members
for select to authenticated
using (
  exists (
    select 1 from public.dispatch_groups g
    where g.id = group_id and g.organization_id = public.current_profile_org_id()
  )
);

drop policy if exists "dispatch_group_members_write_admin" on public.dispatch_group_members;
create policy "dispatch_group_members_write_admin" on public.dispatch_group_members
for all to authenticated
using (
  public.current_profile_role() = 'admin'
  and exists (
    select 1 from public.dispatch_groups g
    where g.id = group_id and g.organization_id = public.current_profile_org_id()
  )
)
with check (
  public.current_profile_role() = 'admin'
  and exists (
    select 1 from public.dispatch_groups g
    where g.id = group_id and g.organization_id = public.current_profile_org_id()
  )
);

-- ---------- Vincular emergencias con tipo y grupos destinatarios ----------
alter table public.emergencies
  add column if not exists emergency_type_id uuid references public.emergency_types(id);

-- target ahora admite 'grupos' además de 'todos' e 'individual'.
alter table public.emergencies drop constraint if exists emergencies_target_check;
alter table public.emergencies
  add constraint emergencies_target_check
  check (target in ('todos','individual','grupos'));

create table if not exists public.emergency_target_groups (
  emergency_id uuid not null references public.emergencies(id) on delete cascade,
  group_id uuid not null references public.dispatch_groups(id),
  primary key (emergency_id, group_id)
);

alter table public.emergency_target_groups enable row level security;

drop policy if exists "emergency_target_groups_read" on public.emergency_target_groups;
create policy "emergency_target_groups_read" on public.emergency_target_groups
for select to authenticated
using (
  exists (
    select 1 from public.emergencies e
    where e.id = emergency_id and e.organization_id = public.current_profile_org_id()
  )
);

drop policy if exists "emergency_target_groups_insert_staff" on public.emergency_target_groups;
create policy "emergency_target_groups_insert_staff" on public.emergency_target_groups
for insert to authenticated
with check (
  public.current_profile_role() in ('admin','guardia')
  and exists (
    select 1 from public.emergencies e
    where e.id = emergency_id and e.organization_id = public.current_profile_org_id()
  )
);

-- Actualiza is_emergency_recipient para que también contemple destinatarios
-- por grupo (además de 'todos' e 'individual').
create or replace function public.is_emergency_recipient(em_id uuid, prof_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.emergencies e
    where e.id = em_id
      and e.organization_id = public.current_profile_org_id()
      and (
        e.target = 'todos'
        or exists (
          select 1 from public.emergency_recipients r
          where r.emergency_id = em_id and r.profile_id = prof_id
        )
        or exists (
          select 1
          from public.emergency_target_groups tg
          join public.dispatch_group_members m on m.group_id = tg.group_id
          where tg.emergency_id = em_id and m.profile_id = prof_id
        )
      )
  )
$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.emergency_types;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.dispatch_groups;
  exception when duplicate_object then null;
  end;
end $$;
-- AGREGAR MOTIVOS DE ASISTENCIA (CON PUNTAJE)
-- Ejecutar en el SQL Editor de Supabase, después de tener corridos
-- schema.sql y agregar-qr-asistencia.sql.
-- ============================================================

create table if not exists public.attendance_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  points numeric not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists attendance_reasons_org_idx
  on public.attendance_reasons(organization_id, sort_order);

alter table public.attendance_reasons enable row level security;

drop policy if exists "attendance_reasons_read" on public.attendance_reasons;
create policy "attendance_reasons_read" on public.attendance_reasons
for select to authenticated
using (organization_id = public.current_profile_org_id());

drop policy if exists "attendance_reasons_write_admin" on public.attendance_reasons;
create policy "attendance_reasons_write_admin" on public.attendance_reasons
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() = 'admin'
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() = 'admin'
);

-- Vincular attendance con el motivo elegido.
alter table public.attendance
  add column if not exists reason_id uuid references public.attendance_reasons(id);

-- Motivos iniciales sugeridos, para el cuartel demo. Si tu organización ya
-- existe con otro id, este insert no hace nada (no hay organización con
-- ese id todavía) — creá los tuyos manualmente desde "Motivos" como admin.
insert into public.attendance_reasons (organization_id, name, points, sort_order)
select organizations.id, defaults.name, defaults.points, defaults.sort_order
from public.organizations,
  (values
    ('Guardia', 3, 1),
    ('Emergencia', 5, 2),
    ('Capacitación', 4, 3),
    ('Prevención', 3, 4),
    ('Reunión', 2, 5)
  ) as defaults(name, points, sort_order)
where not exists (
  select 1 from public.attendance_reasons ar where ar.organization_id = organizations.id
);

-- Actualiza checkin_with_qr para aceptar un motivo opcional.
create or replace function public.checkin_with_qr(qr_token uuid, p_reason_id uuid default null)
returns table(action text, checked_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  session_org uuid;
  my_id uuid := auth.uid();
  my_org uuid;
  open_id uuid;
begin
  select organization_id into session_org
  from public.attendance_qr_sessions
  where token = qr_token and expires_at > now();

  if session_org is null then
    raise exception 'QR inválido o vencido';
  end if;

  select organization_id into my_org from public.profiles where id = my_id;

  if my_org is null or my_org <> session_org then
    raise exception 'Este QR no corresponde a tu cuartel';
  end if;

  select id into open_id
  from public.attendance
  where firefighter_id = my_id and checked_out_at is null;

  if open_id is not null then
    update public.attendance
    set checked_out_at = now()
    where id = open_id;
    return query select 'salida'::text, now();
  else
    insert into public.attendance (organization_id, firefighter_id, type, notes, reason_id)
    values (my_org, my_id, 'cuartel', 'Registrado por QR de consola', p_reason_id)
    returning 'ingreso'::text, checked_in_at into action, checked_at;
    return next;
  end if;
end;
$$;
-- MOTIVOS POR TIPO DE EMERGENCIA (botones configurables, sin límite)
-- Hasta ahora cada botón de emergencia (ej: "Incendio") tenía un único
-- código de texto libre (ej: "01-101"). Ahora el código del tipo (ej: "01")
-- queda en emergency_types.code como antes, y se agrega un segundo nivel
-- de botones — los "motivos" — para elegir de qué se trata dentro de ese
-- tipo (ej: 101 = Casa, 102 = Auto, 103 = Campo...). El admin puede crear
-- tantos motivos como necesite para cada tipo, desde "Botones de
-- emergencia".
--
-- Ejecutar en el SQL Editor de Supabase, después de tener corrido
-- agregar-tipos-emergencia-grupos.sql.
-- ============================================================

create table if not exists public.emergency_type_motives (
  id uuid primary key default gen_random_uuid(),
  emergency_type_id uuid not null references public.emergency_types(id) on delete cascade,
  name text not null,
  code text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists emergency_type_motives_type_idx
  on public.emergency_type_motives(emergency_type_id, sort_order);

alter table public.emergency_type_motives enable row level security;

drop policy if exists "emergency_type_motives_read" on public.emergency_type_motives;
create policy "emergency_type_motives_read" on public.emergency_type_motives
for select to authenticated
using (
  exists (
    select 1 from public.emergency_types t
    where t.id = emergency_type_id and t.organization_id = public.current_profile_org_id()
  )
);

drop policy if exists "emergency_type_motives_write_admin" on public.emergency_type_motives;
create policy "emergency_type_motives_write_admin" on public.emergency_type_motives
for all to authenticated
using (
  public.current_profile_role() = 'admin'
  and exists (
    select 1 from public.emergency_types t
    where t.id = emergency_type_id and t.organization_id = public.current_profile_org_id()
  )
)
with check (
  public.current_profile_role() = 'admin'
  and exists (
    select 1 from public.emergency_types t
    where t.id = emergency_type_id and t.organization_id = public.current_profile_org_id()
  )
);

-- Se anota, en la emergencia creada, qué motivo se eligió (más el código y
-- nombre "congelados" en el momento, para que el historial no cambie si
-- después se edita o borra el motivo).
alter table public.emergencies
  add column if not exists motive_id uuid references public.emergency_type_motives(id) on delete set null;
alter table public.emergencies add column if not exists motive_code text;
alter table public.emergencies add column if not exists motive_name text;

do $$
begin
  begin
    alter publication supabase_realtime add table public.emergency_type_motives;
  exception when duplicate_object then null;
  end;
end $$;
-- PARTE DE GUARDIA AMPLIADO
-- Agrega a "Intervenciones" los campos del cuaderno CARGA_2026.xlsx:
-- N° de parte automático, teléfono, domicilio, barrio, código de
-- siniestro, combustible, y el turno de guardia en el que se originó.
--
-- IMPORTANTE: requiere haber corrido antes agregar-turno-guardia.sql
-- (crea la tabla guard_shifts que se referencia acá abajo).
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- N° de parte: se asigna solo, en orden, y nunca se repite.
alter table public.interventions
  add column if not exists parte_number bigserial;

create unique index if not exists interventions_parte_number_idx
  on public.interventions(parte_number);

alter table public.interventions
  add column if not exists caller_phone text;

alter table public.interventions
  add column if not exists address text;

alter table public.interventions
  add column if not exists barrio text;

alter table public.interventions
  drop constraint if exists interventions_barrio_check;
alter table public.interventions
  add constraint interventions_barrio_check
  check (barrio is null or barrio in ('Villa Nueva','Villa María','Otro'));

alter table public.interventions
  add column if not exists incident_category text;

alter table public.interventions
  drop constraint if exists interventions_incident_category_check;
alter table public.interventions
  add constraint interventions_incident_category_check
  check (incident_category is null or incident_category in (
    'Incendio','Accidente','Salvataje','Rescate','Mantenimiento / Tareas grales.','Organización funcional'
  ));

alter table public.interventions
  add column if not exists fuel_notes text;

alter table public.interventions
  add column if not exists shift_id uuid references public.guard_shifts(id);
-- NUMERACIÓN ANUAL DE PARTES (N° de parte por año)
-- A partir de ahora, el N° de parte se asigna solo, en orden, POR AÑO:
-- el primer parte del 1° de enero arranca en 1 y va sumando (2, 3, 4...)
-- hasta el último del 31 de diciembre. Al año siguiente vuelve a arrancar
-- en 1. La app lo muestra como "N°/año" (ej: 1/2026, 2/2026... 1/2027)
-- para que nunca se confunda un parte de un año con el de otro aunque
-- tengan el mismo número.
--
-- Reemplaza el contador bigserial que se agregó en agregar-parte-guardia.sql
-- (ese sumaba sin parar y sin reiniciar nunca, y por eso podía tener saltos
-- grandes si una carga fallaba a mitad de camino: Postgres no "devuelve"
-- los números de un bigserial aunque el insert falle).
--
-- Ejecutar en el SQL Editor de Supabase, UNA SOLA VEZ.
-- ============================================================

-- Año del parte (se calcula solo a partir de la fecha del hecho).
alter table public.interventions
  add column if not exists parte_year int;

-- Contador: guarda, por cuartel y por año, cuál fue el último número
-- de parte usado. Es la base para que el próximo parte tome "el que sigue".
create table if not exists public.parte_counters (
  organization_id uuid not null references public.organizations(id),
  year int not null,
  last_number bigint not null default 0,
  primary key (organization_id, year)
);

alter table public.parte_counters enable row level security;

drop policy if exists "parte_counters_read" on public.parte_counters;
create policy "parte_counters_read" on public.parte_counters
for select to authenticated
using (organization_id = public.current_profile_org_id());

-- Saca el valor por defecto viejo del N° de parte (el bigserial): de acá
-- en más lo asigna el trigger de abajo, no una secuencia global continua.
alter table public.interventions
  alter column parte_number drop default;

drop index if exists public.interventions_parte_number_idx;

-- Asigna automáticamente parte_number y parte_year al guardar un parte
-- nuevo, tomando el siguiente número libre para (cuartel, año). El
-- "on conflict ... do update" toma el renglón del contador de forma
-- atómica, así dos partes cargados al mismo tiempo nunca pueden salir
-- con el mismo número.
create or replace function public.assign_parte_number()
returns trigger
language plpgsql
as $$
declare
  v_year int;
  v_next bigint;
begin
  if new.parte_number is not null then
    return new;
  end if;

  v_year := extract(year from new.occurred_at)::int;

  insert into public.parte_counters (organization_id, year, last_number)
  values (new.organization_id, v_year, 1)
  on conflict (organization_id, year)
  do update set last_number = public.parte_counters.last_number + 1
  returning last_number into v_next;

  new.parte_number := v_next;
  new.parte_year := v_year;
  return new;
end;
$$;

drop trigger if exists trg_assign_parte_number on public.interventions;
create trigger trg_assign_parte_number
  before insert on public.interventions
  for each row
  execute function public.assign_parte_number();

create unique index if not exists interventions_parte_number_year_idx
  on public.interventions(organization_id, parte_year, parte_number);

-- ---------- Renumera los partes que ya existen ----------
-- Reordena TODOS los partes ya cargados (los 681 históricos de
-- CARGA_2026.xlsx + los que se hayan cargado desde la app) para que,
-- dentro de cada año, arranquen en 1 y sigan el orden real en que
-- ocurrieron (occurred_at). Así el N° de parte que ve la app deja de
-- tener saltos.
with numerados as (
  select
    id,
    extract(year from occurred_at)::int as y,
    row_number() over (
      partition by organization_id, extract(year from occurred_at)
      order by occurred_at, created_at
    ) as n
  from public.interventions
)
update public.interventions i
set parte_number = numerados.n,
    parte_year = numerados.y
from numerados
where i.id = numerados.id;

-- Deja el contador de cada año en el último número usado, para que el
-- próximo parte que se cargue desde la app siga la numeración sin pisar
-- ninguno de los que se acaban de renumerar.
insert into public.parte_counters (organization_id, year, last_number)
select organization_id, parte_year, max(parte_number)
from public.interventions
where parte_year is not null
group by organization_id, parte_year
on conflict (organization_id, year)
do update set last_number = excluded.last_number;
-- ARREGLO: el barrio en Intervenciones no es una lista fija de 3 opciones.
-- Al revisar tu planilla CARGA_2026.xlsx para importar el historial, aparecen
-- más de 130 localidades distintas cargadas ahí (barrios, parajes, pueblos
-- vecinos, etc), no solo "Villa Nueva / Villa María / Otro". Sacamos la
-- restricción para que sea texto libre, igual que Domicilio.
--
-- Ejecutar en el SQL Editor de Supabase, antes de importar-carga-2026.sql.
-- ============================================================

alter table public.interventions
  drop constraint if exists interventions_barrio_check;
-- PARTE DE SINIESTRO COMPLETO
-- Amplía "Intervenciones" para que tenga todos los datos del formulario en
-- papel de la Asociación Bomberos Voluntarios Villa Nueva ("Parte de
-- siniestro"), frente y dorso: aviso, lugar, tipo/motivo, clasificación del
-- siniestro, vehículos siniestrados, damnificados, datos de daños en
-- incendio, negación de atención médica y quién revisó el parte.
--
-- Requiere haber corrido antes agregar-parte-guardia.sql y
-- agregar-numeracion-anual.sql.
--
-- Ejecutar en el SQL Editor de Supabase, UNA SOLA VEZ.
-- ============================================================

-- ---------- 1. Aviso efectuado por ----------
alter table public.interventions add column if not exists reporter_name text;
alter table public.interventions add column if not exists reporter_dni text;
-- (el teléfono de quien avisa ya existe: caller_phone)

-- ---------- 2. Lugar del siniestro ----------
alter table public.interventions add column if not exists cross_street text; -- "entre calle"

-- ---------- 3. Tipo / Motivo / Guardia / horarios generales ----------
alter table public.interventions add column if not exists tipo_code text;
alter table public.interventions add column if not exists motivo_code text;
alter table public.interventions add column if not exists reference_code text; -- "Referencia"
alter table public.interventions add column if not exists guard_departure text; -- Guardia (Hs. Salida)
alter table public.interventions add column if not exists guard_return text;    -- Guardia (Hs. Llegada)
alter table public.interventions add column if not exists departed_at timestamptz; -- Hs. Salida general
alter table public.interventions add column if not exists returned_at timestamptz; -- Hs. Llegada general

-- ---------- Clasificación (INCENDIO/ACCIDENTE/RESCATE/OTRO SERV. + subtipo) ----------
alter table public.interventions add column if not exists incident_subtype text;        -- ej: "Vivienda", "Automóvil", "Persona"
alter table public.interventions add column if not exists incident_subtype_detail text; -- ej: "Vivo", "Atrapado", o texto libre ("HORNO")

-- ---------- Apoyo solicitado ----------
alter table public.interventions add column if not exists support_requested boolean not null default false;
alter table public.interventions add column if not exists support_unit_number text; -- "UNIDAD EN APOYO A U N°"

-- ---------- 6. INCENDIO - Datos sobre lo dañado ----------
alter table public.interventions add column if not exists damage_victim_name text;
alter table public.interventions add column if not exists damage_victim_age text;
alter table public.interventions add column if not exists damage_victim_dni text;
alter table public.interventions add column if not exists damage_type text; -- Rodado/Casa/Galpón/Fábrica/Industria/Campo/Pastizales/Baldío
-- (la descripción de lo dañado se anota en observations, como en el papel)
alter table public.interventions add column if not exists involved_policial boolean not null default false;
alter table public.interventions add column if not exists involved_transito boolean not null default false;
alter table public.interventions add column if not exists involved_forense boolean not null default false;
alter table public.interventions add column if not exists involved_juzgado boolean not null default false;
alter table public.interventions add column if not exists mobile_unit_number text; -- "N° de móvil"
alter table public.interventions add column if not exists in_charge_1 text; -- "A cargo" (1ra línea)
alter table public.interventions add column if not exists in_charge_2 text; -- "A cargo" (2da línea)

-- ---------- 7. Negación de atención médica ----------
alter table public.interventions add column if not exists medical_refusal boolean not null default false;
alter table public.interventions add column if not exists medical_refusal_name text; -- "El Sr/es..."
alter table public.interventions add column if not exists medical_refusal_dni text;

-- ---------- 10. Revisó ----------
-- "Confeccionó" ya existe (created_by = quién armó el parte). "Revisó" se
-- marca después, normalmente por un admin.
alter table public.interventions add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.interventions add column if not exists reviewed_at timestamptz;

-- ---------- Unidades: sumar "Personal a cargo" y "Personal que concurrió" ----------
alter table public.intervention_units add column if not exists personnel_in_charge text;
alter table public.intervention_units add column if not exists crew_member_1 text;
alter table public.intervention_units add column if not exists crew_member_2 text;
alter table public.intervention_units add column if not exists crew_member_3 text;

-- ---------- 4. Vehículos siniestrados ----------
create table if not exists public.intervention_damaged_vehicles (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  vehicle_number int, -- "Rodado 1°, 2°, 3°, 4°"
  brand text,         -- Marca
  model text,         -- Modelo
  plate text,         -- Dominio
  insurance text,     -- Seguro
  policy_number text, -- Póliza
  created_at timestamptz not null default now()
);

alter table public.intervention_damaged_vehicles enable row level security;

drop policy if exists "intervention_damaged_vehicles_read" on public.intervention_damaged_vehicles;
create policy "intervention_damaged_vehicles_read" on public.intervention_damaged_vehicles
for select to authenticated
using (
  exists (
    select 1 from public.interventions i
    where i.id = intervention_id and i.organization_id = public.current_profile_org_id()
  )
);

drop policy if exists "intervention_damaged_vehicles_write_staff" on public.intervention_damaged_vehicles;
create policy "intervention_damaged_vehicles_write_staff" on public.intervention_damaged_vehicles
for all to authenticated
using (
  public.current_profile_role() in ('admin','guardia')
  and exists (
    select 1 from public.interventions i
    where i.id = intervention_id and i.organization_id = public.current_profile_org_id()
  )
)
with check (
  public.current_profile_role() in ('admin','guardia')
  and exists (
    select 1 from public.interventions i
    where i.id = intervention_id and i.organization_id = public.current_profile_org_id()
  )
);

-- ---------- 5. Datos de los damnificados ----------
create table if not exists public.intervention_victims (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  vehicle_number int,  -- "Rodado N°" al que corresponde
  role text check (role in ('propietario','conductor','acompanante','peaton')),
  full_name text,
  age text,
  dni text,
  address text,
  address_number text,
  locality text,
  province text,
  phone text,
  injured boolean not null default false,       -- Herido SI/NO
  triage_color text check (triage_color is null or triage_color in ('rojo','amarillo','verde','negro','blanco_sin_talon')),
  transferred boolean not null default false,    -- Trasladado SI/NO
  transferred_by text,   -- "Trasladado por"
  transferred_to text,   -- "Hacia"
  receiving_doctor text, -- "Recibe Dr/a"
  created_at timestamptz not null default now()
);

alter table public.intervention_victims enable row level security;

drop policy if exists "intervention_victims_read" on public.intervention_victims;
create policy "intervention_victims_read" on public.intervention_victims
for select to authenticated
using (
  exists (
    select 1 from public.interventions i
    where i.id = intervention_id and i.organization_id = public.current_profile_org_id()
  )
);

drop policy if exists "intervention_victims_write_staff" on public.intervention_victims;
create policy "intervention_victims_write_staff" on public.intervention_victims
for all to authenticated
using (
  public.current_profile_role() in ('admin','guardia')
  and exists (
    select 1 from public.interventions i
    where i.id = intervention_id and i.organization_id = public.current_profile_org_id()
  )
)
with check (
  public.current_profile_role() in ('admin','guardia')
  and exists (
    select 1 from public.interventions i
    where i.id = intervention_id and i.organization_id = public.current_profile_org_id()
  )
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.intervention_damaged_vehicles;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.intervention_victims;
  exception when duplicate_object then null;
  end;
end $$;
-- LISTAS DINÁMICAS: "A cargo" y "Personal que concurrió"
-- En el papel esos campos tienen 2 o 3 renglones fijos, pero en la
-- práctica puede haber más nombres para anotar. Se reemplazan las
-- columnas fijas (in_charge_1/in_charge_2, crew_member_1/2/3) por listas
-- que se pueden agregar de a una, sin límite, igual que ya funciona con
-- "Vehículos siniestrados" y "Damnificados".
--
-- Es seguro correrlo tanto si ya ejecutaste agregar-parte-siniestro-
-- completo.sql como si todavía no lo hiciste (revisa la existencia de
-- las columnas antes de tocarlas).
--
-- Ejecutar en el SQL Editor de Supabase, UNA SOLA VEZ, después de
-- agregar-parte-siniestro-completo.sql.
-- ============================================================

-- Por las dudas, si agregar-parte-siniestro-completo.sql no se corrió
-- todavía, crea las columnas viejas vacías para poder migrarlas abajo
-- sin error (si no existen, esto no hace nada).
alter table public.interventions add column if not exists in_charge_1 text;
alter table public.interventions add column if not exists in_charge_2 text;
alter table public.intervention_units add column if not exists crew_member_1 text;
alter table public.intervention_units add column if not exists crew_member_2 text;
alter table public.intervention_units add column if not exists crew_member_3 text;

-- ---------- interventions: "A cargo" (sección 6, INCENDIO) ----------
alter table public.interventions add column if not exists in_charge text[] not null default '{}';

update public.interventions
set in_charge = array_remove(array[in_charge_1, in_charge_2], null)
where (in_charge_1 is not null or in_charge_2 is not null)
  and in_charge = '{}';

alter table public.interventions drop column if exists in_charge_1;
alter table public.interventions drop column if exists in_charge_2;

-- ---------- intervention_units: "Personal que concurrió" ----------
alter table public.intervention_units add column if not exists crew_members text[] not null default '{}';

update public.intervention_units
set crew_members = array_remove(array[crew_member_1, crew_member_2, crew_member_3], null)
where (crew_member_1 is not null or crew_member_2 is not null or crew_member_3 is not null)
  and crew_members = '{}';

alter table public.intervention_units drop column if exists crew_member_1;
alter table public.intervention_units drop column if exists crew_member_2;
alter table public.intervention_units drop column if exists crew_member_3;
-- ARREGLO: no se puede eliminar un botón de emergencia (tipo) que ya se usó
-- alguna vez, porque las emergencias históricas quedan "enganchadas" a ese
-- tipo por emergency_type_id, y esa relación no tenía definido qué hacer
-- al borrar el tipo (Postgres lo bloquea por seguridad).
--
-- El título y el código de cada emergencia ya quedan guardados como texto
-- fijo en emergencies.title en el momento de accionarla, así que no se
-- pierde nada del historial si se borra el tipo — solo se desengancha el
-- vínculo (igual que ya pasa con motive_id).
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

alter table public.emergencies
  drop constraint if exists emergencies_emergency_type_id_fkey;

alter table public.emergencies
  add constraint emergencies_emergency_type_id_fkey
  foreign key (emergency_type_id)
  references public.emergency_types(id)
  on delete set null;
-- NOTIFICACIONES DE MANTENIMIENTO POR TELEGRAM (solo a personas puntuales)
-- Agrega:
--  - profiles.notify_maintenance: marca quién recibe avisos de mantenimiento
--    por Telegram (independiente de recibir avisos de emergencias, que le
--    llegan a todo el que tenga Telegram vinculado).
--  - maintenance_records.alert_notified_at: evita mandar el mismo aviso de
--    "vencido / muy próximo" más de una vez por orden.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

alter table public.profiles
  add column if not exists notify_maintenance boolean not null default false;

alter table public.maintenance_records
  add column if not exists alert_notified_at timestamptz;
-- ARREGLA LOS AVISOS DE MANTENIMIENTO DUPLICADOS Y CAMBIA LA CADENCIA A
-- 15 días antes / 1 semana antes / 1 día antes (mientras la orden sigue
-- "pendiente"), y a un único aviso al asignado el día antes si la orden
-- pasa a "en proceso".
--
-- De paso asegura que existan un par de columnas que el código ya venía
-- usando (responsible_id, alert_notified_at) por si en algún momento se
-- agregaron a mano y no quedaron guardadas en ningún script.
--
-- Ejecutar en el SQL Editor de Supabase, después de subir el código nuevo.
-- ============================================================

alter table public.maintenance_records
  add column if not exists responsible_id uuid references public.profiles(id);

alter table public.maintenance_records
  add column if not exists alert_notified_at timestamptz;

-- Reemplaza el viejo semáforo de 4 colores (que se reiniciaba solo con
-- tocar el campo de fecha, sin cambiarla) por un registro de cuál de los
-- avisos fijos ya se mandó para esta orden.
alter table public.maintenance_records
  add column if not exists alert_checkpoint text
    check (alert_checkpoint in ('15_dias','1_semana','1_dia','en_proceso_dia_antes'));

notify pgrst, 'reload schema';
-- TELEGRAM: vincular cada perfil con su chat_id de Telegram
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

alter table public.profiles
  add column if not exists telegram_chat_id text;
-- NOTIFICACIONES PUSH: suscripciones por usuario y dispositivo
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions(profile_id);

alter table public.push_subscriptions enable row level security;

-- Cada usuario gestiona sus propias suscripciones (un celular = una fila).
drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
for all to authenticated
using (profile_id = auth.uid())
with check (
  profile_id = auth.uid()
  and organization_id = public.current_profile_org_id()
);

-- La función de servidor que envía los avisos usa la service_role key,
-- que ya bypassea RLS automáticamente — no hace falta una policy extra
-- para leer todas las suscripciones desde el servidor.
-- NUEVO: apartado "Administración" — permisos por usuario, no solo por rol.
--
-- Agrega una columna a profiles donde el administrador puede guardar,
-- persona por persona, a qué secciones del sistema tiene acceso.
--
-- allowed_sections = null      -> sigue usando el comportamiento de siempre
--                                  según su rol (no cambia nada para nadie
--                                  que todavía no se haya personalizado).
-- allowed_sections = ARRAY[..] -> lista exacta de secciones habilitadas
--                                  para esa persona (ver lib/permissions.ts
--                                  para la lista de códigos válidos, ej:
--                                  'flota', 'combustible', 'stock', etc).
--
-- No hace falta tocar policies: la política "profiles_update_self_or_admin"
-- ya deja que un admin actualice cualquier perfil de su organización.
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

alter table public.profiles add column if not exists allowed_sections text[];

notify pgrst, 'reload schema';
notify pgrst, 'reload schema';
