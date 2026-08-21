-- ARREGLO: la tabla attendance_qr_sessions quedó con una columna vieja
-- (session_type NOT NULL) de un intento anterior, que rompe la generación
-- del QR. La recreamos limpia. No tiene datos importantes (son sesiones
-- de QR temporales de 45 segundos), así que es seguro borrarla.

drop table if exists public.attendance_qr_sessions cascade;

create table public.attendance_qr_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  token uuid not null default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index attendance_qr_sessions_token_idx
  on public.attendance_qr_sessions(token);
create index attendance_qr_sessions_org_idx
  on public.attendance_qr_sessions(organization_id, expires_at desc);

alter table public.attendance_qr_sessions enable row level security;

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

drop policy if exists "qr_sessions_read_valid" on public.attendance_qr_sessions;
create policy "qr_sessions_read_valid" on public.attendance_qr_sessions
for select to authenticated
using (organization_id = public.current_profile_org_id());

do $$
begin
  begin
    alter publication supabase_realtime add table public.attendance_qr_sessions;
  exception when duplicate_object then null;
  end;
end $$;
