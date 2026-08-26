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
