-- TURNO DE GUARDIA
-- El guardia que llega a trabajar "abre turno" al empezar, y lo "cierra"
-- cuando se va. Solo puede haber un turno abierto por vez en cada cuartel.
-- Los módulos de Libro de Guardia (Llamadas, y los que se agreguen después)
-- van a ir enganchando sus registros al turno que esté abierto en ese momento.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.guard_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  opened_by uuid not null references public.profiles(id),
  opened_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  notes text
);

create index if not exists guard_shifts_org_idx
  on public.guard_shifts(organization_id, opened_at desc);

-- Solo un turno abierto por vez, por cuartel.
create unique index if not exists guard_shifts_one_open
  on public.guard_shifts(organization_id) where closed_at is null;

alter table public.guard_shifts enable row level security;

drop policy if exists "guard_shifts_staff" on public.guard_shifts;
create policy "guard_shifts_staff" on public.guard_shifts
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
);

-- Enganchamos Llamadas al turno abierto (opcional: puede ser null en
-- registros viejos o si nadie abrió turno).
alter table public.guard_calls
  add column if not exists shift_id uuid references public.guard_shifts(id);

do $$
begin
  begin
    alter publication supabase_realtime add table public.guard_shifts;
  exception when duplicate_object then null;
  end;
end $$;
