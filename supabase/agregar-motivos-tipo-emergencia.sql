-- MOTIVOS POR TIPO DE EMERGENCIA (botones configurables, sin límite)
-- Hasta ahora cada botón de emergencia (ej: "Incendio") tenía un único
-- código de texto libre (ej: "01-101"). Ahora el código del tipo (ej: "01")
-- queda en emergency_types.code como antes, y se agrega un segundo nivel
-- de botones — los "motivos" — para elegir de qué se trata dentro de ese
-- tipo (ej: 101 = Casa, 102 = Auto, 103 = Campo...). El admin puede crear
-- tantos motivos como necesite para cada tipo, desde "Botones de
-- emergencia".
--
-- Ejecutar en el SQL Editor de Supabase, después de tener corrido
-- agregar-tipos-emergencia-grupos.sql.
-- ============================================================

create table if not exists public.emergency_type_motives (
  id uuid primary key default gen_random_uuid(),
  emergency_type_id uuid not null references public.emergency_types(id) on delete cascade,
  name text not null,
  code text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists emergency_type_motives_type_idx
  on public.emergency_type_motives(emergency_type_id, sort_order);

alter table public.emergency_type_motives enable row level security;

drop policy if exists "emergency_type_motives_read" on public.emergency_type_motives;
create policy "emergency_type_motives_read" on public.emergency_type_motives
for select to authenticated
using (
  exists (
    select 1 from public.emergency_types t
    where t.id = emergency_type_id and t.organization_id = public.current_profile_org_id()
  )
);

drop policy if exists "emergency_type_motives_write_admin" on public.emergency_type_motives;
create policy "emergency_type_motives_write_admin" on public.emergency_type_motives
for all to authenticated
using (
  public.current_profile_role() = 'admin'
  and exists (
    select 1 from public.emergency_types t
    where t.id = emergency_type_id and t.organization_id = public.current_profile_org_id()
  )
)
with check (
  public.current_profile_role() = 'admin'
  and exists (
    select 1 from public.emergency_types t
    where t.id = emergency_type_id and t.organization_id = public.current_profile_org_id()
  )
);

-- Se anota, en la emergencia creada, qué motivo se eligió (más el código y
-- nombre "congelados" en el momento, para que el historial no cambie si
-- después se edita o borra el motivo).
alter table public.emergencies
  add column if not exists motive_id uuid references public.emergency_type_motives(id) on delete set null;
alter table public.emergencies add column if not exists motive_code text;
alter table public.emergencies add column if not exists motive_name text;

do $$
begin
  begin
    alter publication supabase_realtime add table public.emergency_type_motives;
  exception when duplicate_object then null;
  end;
end $$;
