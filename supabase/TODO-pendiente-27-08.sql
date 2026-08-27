-- ============================================================
-- TODO LO PENDIENTE — correr una sola vez, de punta a punta, en el
-- SQL Editor de Supabase. Junta, en el orden correcto, los 7 scripts
-- que todavía no corriste:
--
--   1) agregar-numeracion-anual.sql
--   2) agregar-parte-siniestro-completo.sql
--   3) agregar-listas-dinamicas.sql
--   4) agregar-motivos-tipo-emergencia.sql
--   5) arreglo-fuel-loads-columnas.sql
--   6) arreglo-barrio-mayusculas.sql
--   7) arreglo-alertas-mantenimiento.sql
--
-- Es seguro de correr aunque alguno de estos ya lo hayas corrido antes
-- por separado (todo está escrito con "si no existe" / "si falta"), así
-- que ante la duda, corré este archivo entero y no pasa nada si repite
-- algo que ya estaba hecho.
-- ============================================================


-- ============================================================
-- 1) NUMERACIÓN ANUAL DE PARTES (N° de parte por año)
-- ============================================================

alter table public.interventions
  add column if not exists parte_year int;

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

alter table public.interventions
  alter column parte_number drop default;

drop index if exists public.interventions_parte_number_idx;

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

insert into public.parte_counters (organization_id, year, last_number)
select organization_id, parte_year, max(parte_number)
from public.interventions
where parte_year is not null
group by organization_id, parte_year
on conflict (organization_id, year)
do update set last_number = excluded.last_number;


-- ============================================================
-- 2) PARTE DE SINIESTRO COMPLETO
-- ============================================================

alter table public.interventions add column if not exists reporter_name text;
alter table public.interventions add column if not exists reporter_dni text;
alter table public.interventions add column if not exists cross_street text;
alter table public.interventions add column if not exists tipo_code text;
alter table public.interventions add column if not exists motivo_code text;
alter table public.interventions add column if not exists reference_code text;
alter table public.interventions add column if not exists guard_departure text;
alter table public.interventions add column if not exists guard_return text;
alter table public.interventions add column if not exists departed_at timestamptz;
alter table public.interventions add column if not exists returned_at timestamptz;
alter table public.interventions add column if not exists incident_subtype text;
alter table public.interventions add column if not exists incident_subtype_detail text;
alter table public.interventions add column if not exists support_requested boolean not null default false;
alter table public.interventions add column if not exists support_unit_number text;
alter table public.interventions add column if not exists damage_victim_name text;
alter table public.interventions add column if not exists damage_victim_age text;
alter table public.interventions add column if not exists damage_victim_dni text;
alter table public.interventions add column if not exists damage_type text;
alter table public.interventions add column if not exists involved_policial boolean not null default false;
alter table public.interventions add column if not exists involved_transito boolean not null default false;
alter table public.interventions add column if not exists involved_forense boolean not null default false;
alter table public.interventions add column if not exists involved_juzgado boolean not null default false;
alter table public.interventions add column if not exists mobile_unit_number text;
alter table public.interventions add column if not exists in_charge_1 text;
alter table public.interventions add column if not exists in_charge_2 text;
alter table public.interventions add column if not exists medical_refusal boolean not null default false;
alter table public.interventions add column if not exists medical_refusal_name text;
alter table public.interventions add column if not exists medical_refusal_dni text;
alter table public.interventions add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.interventions add column if not exists reviewed_at timestamptz;

alter table public.intervention_units add column if not exists personnel_in_charge text;
alter table public.intervention_units add column if not exists crew_member_1 text;
alter table public.intervention_units add column if not exists crew_member_2 text;
alter table public.intervention_units add column if not exists crew_member_3 text;

create table if not exists public.intervention_damaged_vehicles (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  vehicle_number int,
  brand text,
  model text,
  plate text,
  insurance text,
  policy_number text,
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

create table if not exists public.intervention_victims (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  vehicle_number int,
  role text check (role in ('propietario','conductor','acompanante','peaton')),
  full_name text,
  age text,
  dni text,
  address text,
  address_number text,
  locality text,
  province text,
  phone text,
  injured boolean not null default false,
  triage_color text check (triage_color is null or triage_color in ('rojo','amarillo','verde','negro','blanco_sin_talon')),
  transferred boolean not null default false,
  transferred_by text,
  transferred_to text,
  receiving_doctor text,
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


-- ============================================================
-- 3) LISTAS DINÁMICAS: "A cargo" y "Personal que concurrió"
-- ============================================================

alter table public.interventions add column if not exists in_charge_1 text;
alter table public.interventions add column if not exists in_charge_2 text;
alter table public.intervention_units add column if not exists crew_member_1 text;
alter table public.intervention_units add column if not exists crew_member_2 text;
alter table public.intervention_units add column if not exists crew_member_3 text;

alter table public.interventions add column if not exists in_charge text[] not null default '{}';

update public.interventions
set in_charge = array_remove(array[in_charge_1, in_charge_2], null)
where (in_charge_1 is not null or in_charge_2 is not null)
  and in_charge = '{}';

alter table public.interventions drop column if exists in_charge_1;
alter table public.interventions drop column if exists in_charge_2;

alter table public.intervention_units add column if not exists crew_members text[] not null default '{}';

update public.intervention_units
set crew_members = array_remove(array[crew_member_1, crew_member_2, crew_member_3], null)
where (crew_member_1 is not null or crew_member_2 is not null or crew_member_3 is not null)
  and crew_members = '{}';

alter table public.intervention_units drop column if exists crew_member_1;
alter table public.intervention_units drop column if exists crew_member_2;
alter table public.intervention_units drop column if exists crew_member_3;


-- ============================================================
-- 4) MOTIVOS POR TIPO DE EMERGENCIA
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


-- ============================================================
-- 5) ARREGLO: columnas faltantes en fuel_loads (error de "km")
-- ============================================================

alter table public.fuel_loads add column if not exists km numeric;
alter table public.fuel_loads add column if not exists cost numeric;
alter table public.fuel_loads add column if not exists notes text;
alter table public.fuel_loads
  add column if not exists loaded_at timestamptz not null default now();


-- ============================================================
-- 6) ARREGLO: unificar barrios con mayúsculas/minúsculas mezcladas
-- ============================================================

update public.interventions
set barrio = upper(trim(barrio))
where barrio is not null
  and barrio <> upper(trim(barrio));


-- ============================================================
-- 7) ARREGLO: alertas de mantenimiento (columnas + nueva cadencia)
-- ============================================================

alter table public.maintenance_records
  add column if not exists responsible_id uuid references public.profiles(id);

alter table public.maintenance_records
  add column if not exists alert_notified_at timestamptz;

alter table public.maintenance_records
  add column if not exists alert_checkpoint text
    check (alert_checkpoint in ('15_dias','1_semana','1_dia','en_proceso_dia_antes'));


-- ============================================================
-- Recargar el caché de esquema de la API al final de todo.
-- ============================================================
notify pgrst, 'reload schema';
