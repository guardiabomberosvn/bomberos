-- PERMITIR BORRAR REGISTROS DE ASISTENCIA (SOLO ADMIN)
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase.
--
-- La tabla attendance nunca tuvo una política de "delete": hasta ahora,
-- nadie podía borrar un registro desde la aplicación (solo se podía cerrar
-- o editar). Esto habilita borrar, pero solo para admin — pensado para
-- limpiar pruebas, no para el uso diario (el guardia sigue sin poder
-- borrar, solo cargar/cerrar/agregar observaciones).

drop policy if exists "attendance_delete_admin" on public.attendance;
create policy "attendance_delete_admin" on public.attendance
for delete to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() = 'admin'
);
