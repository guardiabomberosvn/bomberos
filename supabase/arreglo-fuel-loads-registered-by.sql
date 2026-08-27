-- ARREGLO (parte 2): "Could not find the 'registered_by' column of
-- 'fuel_loads' in the schema cache"
--
-- La tabla fuel_loads en tu base tiene más columnas faltantes de las que
-- pensé la primera vez (no solo "km" — también "registered_by", y por las
-- dudas cubro acá el resto de las columnas que usa el código, así quedan
-- todas cubiertas de una vez).
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

alter table public.fuel_loads add column if not exists organization_id uuid references public.organizations(id);
alter table public.fuel_loads add column if not exists vehicle_id uuid references public.vehicles(id);
alter table public.fuel_loads add column if not exists liters numeric;
alter table public.fuel_loads add column if not exists km numeric;
alter table public.fuel_loads add column if not exists cost numeric;
alter table public.fuel_loads add column if not exists notes text;
alter table public.fuel_loads
  add column if not exists loaded_at timestamptz not null default now();
alter table public.fuel_loads add column if not exists registered_by uuid references public.profiles(id);

notify pgrst, 'reload schema';
