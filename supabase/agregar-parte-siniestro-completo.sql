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
