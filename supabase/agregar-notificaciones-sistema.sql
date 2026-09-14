-- CAMPANITA DE NOTIFICACIONES (admin / guardia, configurable por usuario)
--
-- Guarda en la base un aviso corto cada vez que pasa algo relevante para
-- quien lleva la guardia: retiro de stock, stock que llega al mínimo,
-- entrada/salida de un bombero, cambio de disponibilidad, un hallazgo nuevo,
-- y las alertas de mantenimiento (reutiliza el mismo "claim" que ya evita
-- duplicar los avisos de Telegram — ver lib/maintenance.ts).
--
-- A propósito NO se avisan las emergencias nuevas acá: quien las dispara es
-- justamente el guardia, no hace falta avisarle de lo que él mismo hizo.
--
-- Se suma como una sección más del sistema de permisos (ver
-- lib/permissions.ts, clave "notificaciones"): un admin puede dársela o
-- sacársela a cualquiera desde Administración, igual que el resto.
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- ---------- Tabla de notificaciones ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  type text not null,
  title text not null,
  body text,
  link text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_org_idx
  on public.notifications(organization_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_read" on public.notifications;
create policy "notifications_read" on public.notifications
for select to authenticated
using (organization_id = public.current_profile_org_id());

-- La mayoría se inserta desde funciones con SECURITY DEFINER (los triggers
-- de abajo), que no dependen de esta policy. Se deja igual, acotada a la
-- propia organización, para el caso de mantenimiento que inserta desde el
-- navegador con la sesión del usuario.
drop policy if exists "notifications_insert_own_org" on public.notifications;
create policy "notifications_insert_own_org" on public.notifications
for insert to authenticated
with check (organization_id = public.current_profile_org_id());

-- ---------- Quién ya la leyó (por persona) ----------
create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, profile_id)
);

alter table public.notification_reads enable row level security;

drop policy if exists "notification_reads_own" on public.notification_reads;
create policy "notification_reads_own" on public.notification_reads
for all to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================
-- Triggers que generan las notificaciones automáticamente
-- ============================================================

-- ---------- Stock: retiro registrado, y stock que cruza el mínimo ----------
create or replace function public.notify_stock_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_total_after numeric;
  v_total_before numeric;
  v_stock_after numeric;
  v_stock_before numeric;
begin
  select * into v_item from public.stock_items where id = new.item_id;
  if v_item.id is null then
    return new;
  end if;

  insert into public.notifications (organization_id, type, title, body, link)
  values (
    new.organization_id,
    'stock_retiro',
    'Retiro de stock: ' || v_item.name,
    new.quantity || ' ' || v_item.unit ||
      case when new.withdrawn_by is not null and new.withdrawn_by <> ''
        then ' — retirado por ' || new.withdrawn_by
        else '' end,
    '/stock'
  );

  select coalesce(sum(quantity), 0) into v_total_after
    from public.stock_withdrawals where item_id = new.item_id;
  v_total_before := v_total_after - new.quantity;
  v_stock_after := v_item.initial_stock - v_total_after;
  v_stock_before := v_item.initial_stock - v_total_before;

  -- Solo avisa en el momento justo en que cruza el mínimo (no en cada
  -- retiro posterior mientras sigue bajo, para no repetir el mismo aviso).
  if v_item.min_stock is not null
     and v_stock_after <= v_item.min_stock
     and v_stock_before > v_item.min_stock then
    insert into public.notifications (organization_id, type, title, body, link)
    values (
      new.organization_id,
      'stock_bajo',
      '⚠️ Stock bajo: ' || v_item.name,
      'Quedan ' || v_stock_after || ' ' || v_item.unit || ' (mínimo ' || v_item.min_stock || ')',
      '/stock'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_stock_withdrawal on public.stock_withdrawals;
create trigger trg_notify_stock_withdrawal
after insert on public.stock_withdrawals
for each row execute function public.notify_stock_withdrawal();

-- ---------- Personal: entrada / salida del cuartel ----------
create or replace function public.notify_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select full_name into v_name
    from public.profiles
    where id = coalesce(new.firefighter_id, old.firefighter_id);

  if tg_op = 'INSERT' then
    insert into public.notifications (organization_id, type, title, link)
    values (
      new.organization_id,
      'asistencia_checkin',
      coalesce(v_name, 'Alguien') || ' marcó entrada',
      '/personal'
    );
  elsif tg_op = 'UPDATE'
    and old.checked_out_at is null
    and new.checked_out_at is not null then
    insert into public.notifications (organization_id, type, title, link)
    values (
      new.organization_id,
      'asistencia_checkout',
      coalesce(v_name, 'Alguien') || ' marcó salida',
      '/personal'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_attendance_change on public.attendance;
create trigger trg_notify_attendance_change
after insert or update on public.attendance
for each row execute function public.notify_attendance_change();

-- ---------- Personal: cambio de disponibilidad ----------
create or replace function public.notify_availability_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.availability is distinct from new.availability then
    insert into public.notifications (organization_id, type, title, link)
    values (
      new.organization_id,
      'disponibilidad',
      new.full_name || ' ahora está ' ||
        case when new.availability = 'disponible' then 'disponible' else 'no disponible' end,
      '/personal'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_availability_change on public.profiles;
create trigger trg_notify_availability_change
after update on public.profiles
for each row execute function public.notify_availability_change();

-- ---------- Hallazgos nuevos ----------
create or replace function public.notify_new_finding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select full_name into v_name from public.profiles where id = new.reported_by;
  insert into public.notifications (organization_id, type, title, body, link)
  values (
    new.organization_id,
    'hallazgo',
    'Nuevo hallazgo reportado',
    coalesce(v_name, 'Alguien') || ': ' || new.description,
    '/hallazgos'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_new_finding on public.maintenance_findings;
create trigger trg_notify_new_finding
after insert on public.maintenance_findings
for each row execute function public.notify_new_finding();

-- Nota: las alertas de mantenimiento (vencido / muy próximo) NO se generan
-- con un trigger acá — ese cálculo (fechas y km) ya vive en
-- lib/maintenance.ts y corre desde el navegador con su propio "claim" para
-- no duplicar avisos de Telegram. Se le agregó ahí mismo el insert a esta
-- tabla, reutilizando ese mismo claim.
