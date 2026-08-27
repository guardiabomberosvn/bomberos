-- ARREGLO: un mismo barrio contado varias veces en Estadísticas por escribirse
-- distinto ("VILLA NUEVA" / "villa nueva" / "Villa Nueva"). De ahora en más el
-- código guarda el barrio siempre en mayúsculas; este script unifica, una
-- sola vez, los que ya estaban cargados con formato mixto.
--
-- Ejecutar en el SQL Editor de Supabase, después de subir el código nuevo.
-- ============================================================

update public.interventions
set barrio = upper(trim(barrio))
where barrio is not null
  and barrio <> upper(trim(barrio));
