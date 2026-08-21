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
