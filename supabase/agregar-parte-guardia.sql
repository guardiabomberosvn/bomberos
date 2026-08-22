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
