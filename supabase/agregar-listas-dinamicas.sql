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
