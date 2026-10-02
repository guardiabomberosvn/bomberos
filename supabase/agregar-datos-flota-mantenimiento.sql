-- MÁS DATOS PARA FLOTA Y MANTENIMIENTO
-- Agrega campos técnicos a los vehículos (chasis, motor, litros, marca,
-- modelo, dominio) y campos de la reparación a cada orden de mantenimiento
-- (km al que se hizo, proveedor, quién la hizo). Todo nullable y aditivo —
-- seguro de correr aunque ya existan filas cargadas.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- ---------- Vehículos: datos técnicos ----------
alter table public.vehicles add column if not exists brand text;
alter table public.vehicles add column if not exists model text;
alter table public.vehicles add column if not exists license_plate text;
alter table public.vehicles add column if not exists chassis_number text;
alter table public.vehicles add column if not exists engine_number text;
-- Capacidad en litros (tanque de agua/espuma en autobombas, combustible en
-- otros casos, etc.) — queda libre porque no todos los vehículos aplican.
alter table public.vehicles add column if not exists tank_liters numeric;

-- ---------- Mantenimiento: datos de la reparación ----------
alter table public.maintenance_records add column if not exists repair_km numeric;
alter table public.maintenance_records add column if not exists provider text;
alter table public.maintenance_records add column if not exists performed_by text;
