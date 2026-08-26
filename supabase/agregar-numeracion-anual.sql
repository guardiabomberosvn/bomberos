-- NUMERACIÓN ANUAL DE PARTES (N° de parte por año)
-- A partir de ahora, el N° de parte se asigna solo, en orden, POR AÑO:
-- el primer parte del 1° de enero arranca en 1 y va sumando (2, 3, 4...)
-- hasta el último del 31 de diciembre. Al año siguiente vuelve a arrancar
-- en 1. La app lo muestra como "N°/año" (ej: 1/2026, 2/2026... 1/2027)
-- para que nunca se confunda un parte de un año con el de otro aunque
-- tengan el mismo número.
--
-- Reemplaza el contador bigserial que se agregó en agregar-parte-guardia.sql
-- (ese sumaba sin parar y sin reiniciar nunca, y por eso podía tener saltos
-- grandes si una carga fallaba a mitad de camino: Postgres no "devuelve"
-- los números de un bigserial aunque el insert falle).
--
-- Ejecutar en el SQL Editor de Supabase, UNA SOLA VEZ.
-- ============================================================

-- Año del parte (se calcula solo a partir de la fecha del hecho).
alter table public.interventions
  add column if not exists parte_year int;

-- Contador: guarda, por cuartel y por año, cuál fue el último número
-- de parte usado. Es la base para que el próximo parte tome "el que sigue".
create table if not exists public.parte_counters (
  organization_id uuid not null references public.organizations(id),
  year int not null,
  last_number bigint not null default 0,
  primary key (organization_id, year)
);

alter table public.parte_counters enable row level security;

drop policy if exists "parte_counters_read" on public.parte_counters;
create policy "parte_counters_read" on public.parte_counters
for select to authenticated
using (organization_id = public.current_profile_org_id());

-- Saca el valor por defecto viejo del N° de parte (el bigserial): de acá
-- en más lo asigna el trigger de abajo, no una secuencia global continua.
alter table public.interventions
  alter column parte_number drop default;

drop index if exists public.interventions_parte_number_idx;

-- Asigna automáticamente parte_number y parte_year al guardar un parte
-- nuevo, tomando el siguiente número libre para (cuartel, año). El
-- "on conflict ... do update" toma el renglón del contador de forma
-- atómica, así dos partes cargados al mismo tiempo nunca pueden salir
-- con el mismo número.
create or replace function public.assign_parte_number()
returns trigger
language plpgsql
as $$
declare
  v_year int;
  v_next bigint;
begin
  if new.parte_number is not null then
    return new;
  end if;

  v_year := extract(year from new.occurred_at)::int;

  insert into public.parte_counters (organization_id, year, last_number)
  values (new.organization_id, v_year, 1)
  on conflict (organization_id, year)
  do update set last_number = public.parte_counters.last_number + 1
  returning last_number into v_next;

  new.parte_number := v_next;
  new.parte_year := v_year;
  return new;
end;
$$;

drop trigger if exists trg_assign_parte_number on public.interventions;
create trigger trg_assign_parte_number
  before insert on public.interventions
  for each row
  execute function public.assign_parte_number();

create unique index if not exists interventions_parte_number_year_idx
  on public.interventions(organization_id, parte_year, parte_number);

-- ---------- Renumera los partes que ya existen ----------
-- Reordena TODOS los partes ya cargados (los 681 históricos de
-- CARGA_2026.xlsx + los que se hayan cargado desde la app) para que,
-- dentro de cada año, arranquen en 1 y sigan el orden real en que
-- ocurrieron (occurred_at). Así el N° de parte que ve la app deja de
-- tener saltos.
with numerados as (
  select
    id,
    extract(year from occurred_at)::int as y,
    row_number() over (
      partition by organization_id, extract(year from occurred_at)
      order by occurred_at, created_at
    ) as n
  from public.interventions
)
update public.interventions i
set parte_number = numerados.n,
    parte_year = numerados.y
from numerados
where i.id = numerados.id;

-- Deja el contador de cada año en el último número usado, para que el
-- próximo parte que se cargue desde la app siga la numeración sin pisar
-- ninguno de los que se acaban de renumerar.
insert into public.parte_counters (organization_id, year, last_number)
select organization_id, parte_year, max(parte_number)
from public.interventions
where parte_year is not null
group by organization_id, parte_year
on conflict (organization_id, year)
do update set last_number = excluded.last_number;
