-- DEVOLVERLE A GUARDIA EL PERMISO DE CARGAR/CERRAR ASISTENCIA DE OTROS
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase.
--
-- Hace un tiempo, "agregar-asistencia-admin.sql" había restringido esto a
-- solo admin (en ese momento la idea era que únicamente el administrador
-- cargara a mano desde la PC del cuartel). Esa restricción se quedó
-- pisando la Carga rápida y la Carga retroactiva de "Asistencia (todos)",
-- que están pensadas justamente para que las use el guardia de turno —
-- por eso tocar "salida" de otra persona o cargarle el ingreso no
-- funcionaba (error de "row-level security"). Esto lo revierte, volviendo
-- al comportamiento original: guardia y admin pueden cargar/cerrar la
-- asistencia de terceros; un bombero sigue sin poder tocar la de otro.

drop policy if exists "attendance_insert_self_or_admin" on public.attendance;
drop policy if exists "attendance_insert_self_or_staff" on public.attendance;
create policy "attendance_insert_self_or_staff" on public.attendance
for insert to authenticated
with check (
  organization_id = public.current_profile_org_id()
  and (
    firefighter_id = auth.uid()
    or public.current_profile_role() in ('admin', 'guardia')
  )
);

drop policy if exists "attendance_update_self_or_admin" on public.attendance;
create policy "attendance_update_self_or_admin" on public.attendance
for update to authenticated
using (
  organization_id = public.current_profile_org_id()
  and (firefighter_id = auth.uid() or public.current_profile_role() in ('admin', 'guardia'))
)
with check (organization_id = public.current_profile_org_id());
