-- AGREGAR MOTIVOS DE ASISTENCIA (CON PUNTAJE)
-- Ejecutar en el SQL Editor de Supabase, después de tener corridos
-- schema.sql y agregar-qr-asistencia.sql.
-- ============================================================

create table if not exists public.attendance_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  points numeric not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists attendance_reasons_org_idx
  on public.attendance_reasons(organization_id, sort_order);

alter table public.attendance_reasons enable row level security;

drop policy if exists "attendance_reasons_read" on public.attendance_reasons;
create policy "attendance_reasons_read" on public.attendance_reasons
for select to authenticated
using (organization_id = public.current_profile_org_id());

drop policy if exists "attendance_reasons_write_admin" on public.attendance_reasons;
create policy "attendance_reasons_write_admin" on public.attendance_reasons
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() = 'admin'
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() = 'admin'
);

-- Vincular attendance con el motivo elegido.
alter table public.attendance
  add column if not exists reason_id uuid references public.attendance_reasons(id);

-- Motivos iniciales sugeridos, para el cuartel demo. Si tu organización ya
-- existe con otro id, este insert no hace nada (no hay organización con
-- ese id todavía) — creá los tuyos manualmente desde "Motivos" como admin.
insert into public.attendance_reasons (organization_id, name, points, sort_order)
select id, name, points, sort_order
from public.organizations,
  (values
    ('Guardia', 3, 1),
    ('Emergencia', 5, 2),
    ('Capacitación', 4, 3),
    ('Prevención', 3, 4),
    ('Reunión', 2, 5)
  ) as defaults(name, points, sort_order)
where not exists (
  select 1 from public.attendance_reasons ar where ar.organization_id = organizations.id
);

-- Actualiza checkin_with_qr para aceptar un motivo opcional.
create or replace function public.checkin_with_qr(qr_token uuid, p_reason_id uuid default null)
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
    insert into public.attendance (organization_id, firefighter_id, type, notes, reason_id)
    values (my_org, my_id, 'cuartel', 'Registrado por QR de consola', p_reason_id)
    returning 'ingreso'::text, checked_in_at into action, checked_at;
    return next;
  end if;
end;
$$;
