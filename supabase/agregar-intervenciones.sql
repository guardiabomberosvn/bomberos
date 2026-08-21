-- INTERVENCIONES
-- Registro del servicio completo: fecha/hora, unidades participantes,
-- personal a cargo, operador, observaciones. Opcionalmente vinculada a
-- una emergencia del módulo de Emergencias.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.interventions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  emergency_id uuid references public.emergencies(id),
  title text not null,
  occurred_at timestamptz not null default now(),
  personnel_in_charge text,
  operator_id uuid references public.profiles(id),
  observations text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists interventions_org_idx
  on public.interventions(organization_id, occurred_at desc);

alter table public.interventions enable row level security;

drop policy if exists "interventions_read" on public.interventions;
create policy "interventions_read" on public.interventions
for select to authenticated
using (organization_id = public.current_profile_org_id());

drop policy if exists "interventions_write_staff" on public.interventions;
create policy "interventions_write_staff" on public.interventions
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
);

-- Unidades que participaron de la intervención.
create table if not exists public.intervention_units (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id),
  driver_id uuid references public.profiles(id),
  departed_at timestamptz,
  returned_at timestamptz,
  km_out numeric,
  km_in numeric
);

alter table public.intervention_units enable row level security;

drop policy if exists "intervention_units_read" on public.intervention_units;
create policy "intervention_units_read" on public.intervention_units
for select to authenticated
using (
  exists (
    select 1 from public.interventions i
    where i.id = intervention_id and i.organization_id = public.current_profile_org_id()
  )
);

drop policy if exists "intervention_units_write_staff" on public.intervention_units;
create policy "intervention_units_write_staff" on public.intervention_units
for all to authenticated
using (
  public.current_profile_role() in ('admin','guardia')
  and exists (
    select 1 from public.interventions i
    where i.id = intervention_id and i.organization_id = public.current_profile_org_id()
  )
)
with check (
  public.current_profile_role() in ('admin','guardia')
  and exists (
    select 1 from public.interventions i
    where i.id = intervention_id and i.organization_id = public.current_profile_org_id()
  )
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.interventions;
  exception when duplicate_object then null;
  end;
end $$;
