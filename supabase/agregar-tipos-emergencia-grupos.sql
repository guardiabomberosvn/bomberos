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
