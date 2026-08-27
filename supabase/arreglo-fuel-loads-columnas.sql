-- ARREGLO: "Could not find the 'km' column of 'fuel_loads' in the schema cache"
-- La tabla fuel_loads se creó en algún momento sin alguna de estas columnas
-- (agregar-flota-mantenimiento.sql usa "create table if not exists", que no
-- agrega columnas nuevas a una tabla que ya existía). Este script las agrega
-- si faltan, sin tocar los datos que ya haya cargados.
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

alter table public.fuel_loads add column if not exists km numeric;
alter table public.fuel_loads add column if not exists cost numeric;
alter table public.fuel_loads add column if not exists notes text;
alter table public.fuel_loads
  add column if not exists loaded_at timestamptz not null default now();

-- Le avisa a la API de Supabase que recargue el esquema ahora mismo (si no,
-- puede tardar unos segundos en darse cuenta de las columnas nuevas).
notify pgrst, 'reload schema';
