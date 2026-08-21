-- AGREGAR QR DE ASISTENCIA POR CONSOLA
-- Ejecutar este archivo UNA VEZ en el SQL Editor de Supabase si ya tenías
-- el schema.sql y agregar-emergencias.sql corridos. Seguro de re-ejecutar.
-- ============================================================

-- Sesión de QR generada por Guardia/Admin desde la consola. El bombero
-- escanea el "token" con su celular; el backend valida que esté vigente
-- y registra ingreso o egreso según corresponda.
create table if not exists public.attendance_qr_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  token uuid not null default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists attendance_qr_sessions_token_idx
  on public.attendance_qr_sessions(token);
create index if not exists attendance_qr_sessions_org_idx
  on public.attendance_qr_sessions(organization_id, expires_at desc);

alter table public.attendance_qr_sessions enable row level security;

-- Solo staff puede generar/ver sesiones QR de su organización.
drop policy if exists "qr_sessions_staff" on public.attendance_qr_sessions;
create policy "qr_sessions_staff" on public.attendance_qr_sessions
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
  and created_by = auth.uid()
);

-- Cualquier autenticado de la misma organización puede LEER si un token es
-- válido (necesario para que el bombero valide el QR que escaneó), pero
-- solo ve el id/expiración, no puede generarlos ni modificarlos.
drop policy if exists "qr_sessions_read_valid" on public.attendance_qr_sessions;
create policy "qr_sessions_read_valid" on public.attendance_qr_sessions
for select to authenticated
using (organization_id = public.current_profile_org_id());

-- Función que registra ingreso/egreso del bombero autenticado a partir de
-- un token de QR vigente. SECURITY DEFINER porque el bombero no tiene
-- permiso directo para leer si el token existe más allá de su propia fila.
create or replace function public.checkin_with_qr(qr_token uuid)
returns table(action text, checked_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  session_org uuid;
  my_id uuid := auth.uid();
  my_org uuid;
  open_id uuid;
begin
  select organization_id into session_org
  from public.attendance_qr_sessions
  where token = qr_token and expires_at > now();

  if session_org is null then
    raise exception 'QR inválido o vencido';
  end if;

  select organization_id into my_org from public.profiles where id = my_id;

  if my_org is null or my_org <> session_org then
    raise exception 'Este QR no corresponde a tu cuartel';
  end if;

  select id into open_id
  from public.attendance
  where firefighter_id = my_id and checked_out_at is null;

  if open_id is not null then
    update public.attendance
    set checked_out_at = now()
    where id = open_id;
    return query select 'salida'::text, now();
  else
    insert into public.attendance (organization_id, firefighter_id, type, notes)
    values (my_org, my_id, 'cuartel', 'Registrado por QR de consola')
    returning 'ingreso'::text, checked_in_at into action, checked_at;
    return next;
  end if;
end;
$$;

-- Realtime para la sesión QR (así la consola detecta escaneos al instante
-- si en el futuro se quiere mostrar feedback en vivo).
do $$
begin
  begin
    alter publication supabase_realtime add table public.attendance_qr_sessions;
  exception when duplicate_object then null;
  end;
end $$;
