-- TELEGRAM: vincular cada perfil con su chat_id de Telegram
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

alter table public.profiles
  add column if not exists telegram_chat_id text;
