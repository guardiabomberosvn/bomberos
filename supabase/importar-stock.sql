-- IMPORTACIÓN DE DATOS HISTÓRICOS: Control_stock_mercaderia_e_insumos.xlsx
-- Carga los insumos ya cargados en la planilla, con su stock inicial, y los
-- retiros que ya estaban registrados.
--
-- IMPORTANTE:
--  * Ejecutar UNA SOLA VEZ, después de haber corrido agregar-stock.sql.
--  * La columna "Unidad" (Paquete, Kg, Litro, etc) venía mal cargada para casi
--    todos los insumos en tu planilla original (tenía números sueltos en vez de
--    texto) — se importó como "unidades" genérico. Después de importar, andá a
--    Stock → "Recargar / editar" en cada insumo para corregir la unidad real,
--    si querés (podés escribir lo que sea, ej: Paquete, Kg, Litro).
--  * El stock actual que ves en la app puede diferir un poco del que mostraba
--    la planilla vieja: acá se calcula siempre en vivo (inicial - retiros reales),
--    mientras que la fórmula de Excel podía haber quedado desactualizada.
-- ============================================================

do $$
begin
  if exists (select 1 from public.stock_items where name in ('yerba', 'polenta', 'cacao', 'harina', 'pure de tomate', 'lustra muebre', 'bolsas 45x60', 'bolsas 60x90', 'bolsas 80x100', 'esponja', 'papel hgienico', 'sevilleta', 'azucar', 'mate cocido', 'te', 'cif')) then
    raise exception 'Ya existen insumos con estos nombres — parece que el stock histórico ya se importó. Si querés reimportar, borralos primero.';
  end if;
end $$;

-- ---------- Insumos con su stock inicial/cargado ----------
insert into public.stock_items (organization_id, name, unit, initial_stock)
values
  ((select id from public.organizations order by created_at limit 1), 'yerba', 'unidades', 23),
  ((select id from public.organizations order by created_at limit 1), 'polenta', 'unidades', 18),
  ((select id from public.organizations order by created_at limit 1), 'cacao', 'unidades', 3),
  ((select id from public.organizations order by created_at limit 1), 'harina', 'unidades', 6),
  ((select id from public.organizations order by created_at limit 1), 'pure de tomate', 'unidades', 5),
  ((select id from public.organizations order by created_at limit 1), 'lustra muebre', 'unidades', 3),
  ((select id from public.organizations order by created_at limit 1), 'bolsas 45x60', 'unidades', 4),
  ((select id from public.organizations order by created_at limit 1), 'bolsas 60x90', 'unidades', 4),
  ((select id from public.organizations order by created_at limit 1), 'bolsas 80x100', 'unidades', 1),
  ((select id from public.organizations order by created_at limit 1), 'esponja', 'unidades', 8),
  ((select id from public.organizations order by created_at limit 1), 'papel hgienico', 'unidades', 14),
  ((select id from public.organizations order by created_at limit 1), 'sevilleta', 'unidades', 3),
  ((select id from public.organizations order by created_at limit 1), 'azucar', 'unidades', 10),
  ((select id from public.organizations order by created_at limit 1), 'mate cocido', 'unidades', 2),
  ((select id from public.organizations order by created_at limit 1), 'te', 'unidades', 1),
  ((select id from public.organizations order by created_at limit 1), 'cif', 'unidades', 1);

-- ---------- Retiros que ya estaban registrados ----------
insert into public.stock_withdrawals (organization_id, item_id, quantity, withdrawn_at, withdrawn_by, destination, notes)
select (select id from public.organizations order by created_at limit 1), si.id, w.quantity, w.withdrawn_at, w.withdrawn_by, w.destination, w.notes
from (values
  ('azucar', 2::numeric, '2026-08-15 10:30:00'::timestamptz, 'Juan Pérez', 'Cocina', 'Reposición para consumo interno [IMP-STOCK-RETIROS]'),
  ('azucar', 1::numeric, '2026-08-15 20:48:11'::timestamptz, 'Boaglio', 'Cocina', 'Reposición para consumo interno [IMP-STOCK-RETIROS]')
) as w(item_name, quantity, withdrawn_at, withdrawn_by, destination, notes)
join public.stock_items si on si.organization_id = (select id from public.organizations order by created_at limit 1) and si.name = w.item_name;
