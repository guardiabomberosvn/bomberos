-- ARREGLO: no se puede eliminar un botón de emergencia (tipo) que ya se usó
-- alguna vez, porque las emergencias históricas quedan "enganchadas" a ese
-- tipo por emergency_type_id, y esa relación no tenía definido qué hacer
-- al borrar el tipo (Postgres lo bloquea por seguridad).
--
-- El título y el código de cada emergencia ya quedan guardados como texto
-- fijo en emergencies.title en el momento de accionarla, así que no se
-- pierde nada del historial si se borra el tipo — solo se desengancha el
-- vínculo (igual que ya pasa con motive_id).
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

alter table public.emergencies
  drop constraint if exists emergencies_emergency_type_id_fkey;

alter table public.emergencies
  add constraint emergencies_emergency_type_id_fkey
  foreign key (emergency_type_id)
  references public.emergency_types(id)
  on delete set null;
