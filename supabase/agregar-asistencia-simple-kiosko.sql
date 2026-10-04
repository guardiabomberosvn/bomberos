-- ASISTENCIA SIMPLE (un botón por bombero) + AUTOGESTIÓN POR LEGAJO (tablet)
-- ============================================================
-- Ejecutar completo en Supabase > SQL Editor.
--
-- 1) Cada registro de asistencia que carga un guardia por otra persona
--    (ingreso rápido, o carga retroactiva de alguien que se olvidó de
--    marcar) ahora queda vinculado al turno de guardia abierto en ese
--    momento — mismo mecanismo que ya usa Libro de Guardia con sus
--    llamadas (guard_calls.shift_id) — y guarda el nombre de ese guardia.
--    Un registro que la persona carga ella misma (QR propio o tablet por
--    legajo) no lleva guardia asociado: se cargó solo.

alter table public.attendance
  add column if not exists shift_id uuid references public.guard_shifts(id),
  add column if not exists loaded_by_name text;

create index if not exists attendance_shift_idx on public.attendance(shift_id);

-- 2) Autogestión por legajo, pensada para una tablet compartida del
-- cuartel (una sola cuenta logueada ahí, habilitada solo a la sección
-- "Kiosko" desde Administración). No identifica a la persona por su
-- sesión (como hace el QR) sino por el número de legajo que escribe en la
-- tablet. Mismo patrón de ida y vuelta que checkin_with_qr: si ya tiene un
-- registro abierto, este llamado lo cierra (egreso) sin importar quién lo
-- haya abierto (incluido un guardia que lo cargó por una emergencia); si
-- no tiene, abre uno nuevo (ingreso).
create or replace function public.checkin_with_legajo(p_legajo text, p_reason_id uuid default null)
returns table(action text, checked_at timestamptz, firefighter_name text)
language plpgsql
security definer set search_path = public
as $$
declare
  caller_org uuid;
  target_id uuid;
  target_name text;
  open_id uuid;
begin
  select organization_id into caller_org from public.profiles where id = auth.uid();
  if caller_org is null then
    raise exception 'No se pudo identificar la cuenta de la tablet.';
  end if;

  select id, full_name into target_id, target_name
  from public.profiles
  where organization_id = caller_org and legajo = p_legajo and is_active;

  if target_id is null then
    raise exception 'No hay nadie activo con ese legajo en este cuartel.';
  end if;

  select id into open_id
  from public.attendance
  where firefighter_id = target_id and checked_out_at is null;

  if open_id is not null then
    update public.attendance
    set checked_out_at = now()
    where id = open_id;
    return query select 'salida'::text, now(), target_name;
  else
    insert into public.attendance (organization_id, firefighter_id, type, reason_id, notes)
    values (caller_org, target_id, 'cuartel', p_reason_id, 'Autogestionado en tablet por legajo')
    returning 'ingreso'::text, checked_in_at, target_name into action, checked_at, firefighter_name;
    return next;
  end if;
end;
$$;
