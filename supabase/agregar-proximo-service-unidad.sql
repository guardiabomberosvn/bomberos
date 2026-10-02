-- PRÓXIMO SERVICE: AHORA ES UN DATO DE LA UNIDAD, NO DE LA ORDEN
-- Antes "cuándo toca el próximo service" (target_date / target_km) vivía en
-- cada orden de mantenimiento, mezclado con los datos de esa orden puntual.
-- Ahora es un dato propio del vehículo: cada unidad tiene UN próximo service
-- planificado (por fecha y/o km), con su tipo y qué hay que hacer. Las
-- columnas viejas target_date/target_km en maintenance_records quedan en la
-- base (no se tocan, por las órdenes ya cargadas) pero la app deja de
-- usarlas — cada orden ahora es solo el registro de un trabajo puntual.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

alter table public.vehicles add column if not exists next_service_date date;
alter table public.vehicles add column if not exists next_service_km numeric;
alter table public.vehicles add column if not exists next_service_type text
  check (next_service_type in ('preventivo','correctivo','inspeccion'));
-- Qué hay que hacer en ese próximo service (ej: "Cambio de aceite y filtros").
alter table public.vehicles add column if not exists next_service_notes text;

-- Dedup de avisos por Telegram — mismo mecanismo de "checkpoint" que tenía
-- cada orden, pero ahora a nivel vehículo.
alter table public.vehicles add column if not exists service_alert_checkpoint text
  check (service_alert_checkpoint in ('15_dias','1_semana','1_dia'));
alter table public.vehicles add column if not exists service_alert_notified_at timestamptz;
