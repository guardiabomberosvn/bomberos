-- AVISOS A OTRAS FUERZAS O SERVICIOS
-- Digitaliza el cuaderno AVISOS_A_OTRAS_FUERZAS.xlsx: registro de llamados
-- hechos a otras fuerzas/servicios (Policía, EPEC, Tránsito, etc).
--
-- IMPORTANTE: requiere haber corrido antes agregar-turno-guardia.sql
-- (crea la tabla guard_shifts que se referencia acá abajo).
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.other_force_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  service_name text not null,
  called_at timestamptz not null default now(),
  code text,
  cause text not null,
  address text,
  locality text,
  received_by_name text,
  taken_by uuid references public.profiles(id),
  shift_id uuid references public.guard_shifts(id),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists other_force_notices_org_idx
  on public.other_force_notices(organization_id, called_at desc);

alter table public.other_force_notices enable row level security;

drop policy if exists "other_force_notices_staff" on public.other_force_notices;
create policy "other_force_notices_staff" on public.other_force_notices
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.other_force_notices;
  exception when duplicate_object then null;
  end;
end $$;
