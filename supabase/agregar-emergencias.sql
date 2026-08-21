-- AGREGAR MÓDULO DE EMERGENCIAS A UNA BASE YA EXISTENTE
-- Ejecutar este archivo UNA VEZ en el SQL Editor de Supabase si ya tenías
-- el schema.sql anterior corrido. No hace falta re-ejecutar el schema.sql
-- completo — esto solo agrega lo nuevo (usa "if not exists" y "drop policy
-- if exists" así que es seguro correrlo aunque algo ya exista).
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
