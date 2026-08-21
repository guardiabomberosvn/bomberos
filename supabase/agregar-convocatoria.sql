-- EMERGENCIAS CON/SIN CONVOCATORIA
-- Permite que una alerta sea solo informativa (sin pedir ACUDO/NO ACUDO)
-- o de convocatoria real (con botones de respuesta).
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

alter table public.emergencies
  add column if not exists needs_response boolean not null default true;
