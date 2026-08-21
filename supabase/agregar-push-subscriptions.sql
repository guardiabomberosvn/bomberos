-- NOTIFICACIONES PUSH: suscripciones por usuario y dispositivo
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions(profile_id);

alter table public.push_subscriptions enable row level security;

-- Cada usuario gestiona sus propias suscripciones (un celular = una fila).
drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
for all to authenticated
using (profile_id = auth.uid())
with check (
  profile_id = auth.uid()
  and organization_id = public.current_profile_org_id()
);

-- La función de servidor que envía los avisos usa la service_role key,
-- que ya bypassea RLS automáticamente — no hace falta una policy extra
-- para leer todas las suscripciones desde el servidor.
