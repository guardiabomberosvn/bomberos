-- ARREGLA LOS AVISOS DE MANTENIMIENTO DUPLICADOS Y CAMBIA LA CADENCIA A
-- 15 días antes / 1 semana antes / 1 día antes (mientras la orden sigue
-- "pendiente"), y a un único aviso al asignado el día antes si la orden
-- pasa a "en proceso".
--
-- De paso asegura que existan un par de columnas que el código ya venía
-- usando (responsible_id, alert_notified_at) por si en algún momento se
-- agregaron a mano y no quedaron guardadas en ningún script.
--
-- Ejecutar en el SQL Editor de Supabase, después de subir el código nuevo.
-- ============================================================

alter table public.maintenance_records
  add column if not exists responsible_id uuid references public.profiles(id);

alter table public.maintenance_records
  add column if not exists alert_notified_at timestamptz;

-- Reemplaza el viejo semáforo de 4 colores (que se reiniciaba solo con
-- tocar el campo de fecha, sin cambiarla) por un registro de cuál de los
-- avisos fijos ya se mandó para esta orden.
alter table public.maintenance_records
  add column if not exists alert_checkpoint text
    check (alert_checkpoint in ('15_dias','1_semana','1_dia','en_proceso_dia_antes'));

notify pgrst, 'reload schema';
