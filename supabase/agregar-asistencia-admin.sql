-- ASISTENCIA: SOLO ADMIN GESTIONA A TERCEROS DESDE PC
-- El bombero, en su celular, sólo usa el QR para entrar/salir.
-- Guardia deja de poder cargar/cerrar asistencia de otros (sólo Admin).
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

drop policy if exists "attendance_insert_self_or_staff" on public.attendance;
create policy "attendance_insert_self_or_admin" on public.attendance
for insert to authenticated
with check (
  organization_id = public.current_profile_org_id()
  and (
    firefighter_id = auth.uid()
    or public.current_profile_role() = 'admin'
  )
);

drop policy if exists "attendance_update_self_or_admin" on public.attendance;
create policy "attendance_update_self_or_admin" on public.attendance
for update to authenticated
using (
  organization_id = public.current_profile_org_id()
  and (firefighter_id = auth.uid() or public.current_profile_role() = 'admin')
)
with check (organization_id = public.current_profile_org_id());

-- El trigger que protege campos sensibles de asistencia ya sólo limitaba a
-- 'bombero'; lo dejamos igual (guardia ya no tiene policy para tocar
-- terceros, así que no hace falta ajustar el trigger).
