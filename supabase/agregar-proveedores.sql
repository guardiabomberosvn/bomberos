-- PROVEEDORES (datos de contacto + historial de compras)
-- Agrega un apartado "Proveedores" en Operación: catálogo de proveedores
-- con sus datos de contacto, y un registro de compras hechas a cada uno
-- (fecha, monto y qué se compró), para poder ver cuánto se gastó y en qué
-- con cada proveedor a lo largo del tiempo.
--
-- Mismo patrón que agregar-stock.sql: escritura habilitada para
-- admin/guardia, usando las funciones existentes
-- public.current_profile_org_id() y public.current_profile_role().
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- ---------- Proveedores (catálogo + datos de contacto) ----------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  specialty text,
  contact_name text,
  phone text,
  email text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_org_idx
  on public.suppliers(organization_id, name);

alter table public.suppliers enable row level security;

drop policy if exists "suppliers_staff" on public.suppliers;
create policy "suppliers_staff" on public.suppliers
for all to authenticated
using (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
)
with check (
  organization_id = public.current_profile_org_id()
  and public.current_profile_role() in ('admin','guardia')
);

-- ---------- Historial de compras a cada proveedor ----------
create table if not exists public.supplier_purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  purchase_date date not null default current_date,
  amount numeric,
  description text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists supplier_purchases_org_idx
  on public.supplier_purchases(organization_id, purchase_date desc);
create index if not exists supplier_purchases_supplier_idx
  on public.supplier_purchases(supplier_id);

alter table public.supplier_purchases enable row level security;

drop policy if exists "supplier_purchases_staff" on public.supplier_purchases;
create policy "supplier_purchases_staff" on public.supplier_purchases
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
    alter publication supabase_realtime add table public.suppliers;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.supplier_purchases;
  exception when duplicate_object then null;
  end;
end $$;
