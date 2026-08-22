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
