-- CONTROL DE STOCK (mercadería e insumos)
-- Digitaliza Control_stock_mercaderia_e_insumos.xlsx: catálogo de insumos
-- con su stock inicial/cargado, y un registro de retiros que descuenta
-- automáticamente del stock disponible.
--
-- IMPORTANTE: requiere haber corrido antes agregar-turno-guardia.sql
-- (crea la tabla guard_shifts que se referencia acá abajo).
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- ---------- Insumos (catálogo + stock inicial/cargado) ----------
create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  unit text not null default 'unidades',
  initial_stock numeric not null default 0,
  min_stock numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_items_org_idx
  on public.stock_items(organization_id, name);

alter table public.stock_items enable row level security;

drop policy if exists "stock_items_staff" on public.stock_items;
create policy "stock_items_staff" on public.stock_items
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
);

-- ---------- Registro de retiros (descuenta del stock) ----------
create table if not exists public.stock_withdrawals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  item_id uuid not null references public.stock_items(id),
  quantity numeric not null check (quantity > 0),
  withdrawn_at timestamptz not null default now(),
  operator_id uuid references public.profiles(id),
  withdrawn_by text,
  destination text,
  notes text,
  shift_id uuid references public.guard_shifts(id)
);

create index if not exists stock_withdrawals_org_idx
  on public.stock_withdrawals(organization_id, withdrawn_at desc);
create index if not exists stock_withdrawals_item_idx
  on public.stock_withdrawals(item_id);

alter table public.stock_withdrawals enable row level security;

drop policy if exists "stock_withdrawals_staff" on public.stock_withdrawals;
create policy "stock_withdrawals_staff" on public.stock_withdrawals
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
    alter publication supabase_realtime add table public.stock_items;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.stock_withdrawals;
  exception when duplicate_object then null;
  end;
end $$;
