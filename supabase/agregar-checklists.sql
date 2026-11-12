-- AGREGAR CHECKLISTS DE EQUIPOS (MÁQUINAS, EQUIPAMIENTO Y HERRAMIENTAS)
-- Ejecutar en el SQL Editor de Supabase, después de tener corrido schema.sql.
--
-- Cada equipo es UNA fila y guarda solo su inspección más reciente
-- (semáforo: verde / amarillo / rojo + una nota). Cuando se vuelve a
-- inspeccionar el mismo equipo, la fila se pisa con lo nuevo — no se
-- acumula historial, así casi no ocupa espacio.
-- ============================================================

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  category text not null check (category in ('maquinas', 'equipamiento', 'herramientas')),
  name text not null,
  detail text,
  status text check (status in ('verde', 'amarillo', 'rojo')),
  note text,
  inspected_by uuid references public.profiles(id) on delete set null,
  inspected_by_name text,
  inspected_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, category, name)
);

create index if not exists checklist_items_org_idx
  on public.checklist_items(organization_id, category, name);

alter table public.checklist_items enable row level security;

-- Cualquiera con sesión de la organización puede VER los equipos.
drop policy if exists "checklist_items_read" on public.checklist_items;
create policy "checklist_items_read" on public.checklist_items
for select to authenticated
using (organization_id = public.current_profile_org_id());

-- Solo admin y jefatura pueden AGREGAR equipos nuevos.
drop policy if exists "checklist_items_insert" on public.checklist_items;
create policy "checklist_items_insert" on public.checklist_items
for insert to authenticated
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin', 'jefatura')
);

-- Admin, jefatura y guardia pueden INSPECCIONAR (cambiar el semáforo).
drop policy if exists "checklist_items_update" on public.checklist_items;
create policy "checklist_items_update" on public.checklist_items
for update to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin', 'jefatura', 'guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin', 'jefatura', 'guardia')
);

-- Solo admin y jefatura pueden ELIMINAR equipos.
drop policy if exists "checklist_items_delete" on public.checklist_items;
create policy "checklist_items_delete" on public.checklist_items
for delete to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin', 'jefatura')
);

notify pgrst, 'reload schema';
