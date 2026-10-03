-- VINCULACIÓN DE TELEGRAM AUTOMÁTICA (vía webhook, sin desconectar nada)
-- Antes, vincular el Telegram de una persona usaba el método "getUpdates"
-- de Telegram desde el navegador, que choca con el webhook (Telegram no
-- deja usar los dos modos al mismo tiempo) — por eso había que sacar el
-- webhook en Integraciones, vincular, y volver a conectarlo después.
--
-- Ahora el código de 6 dígitos que se genera en /vincular-telegram se
-- guarda acá, en el propio perfil, y el webhook (el mismo que ya procesa
-- ACUDO/NO ACUDO) lo reconoce cuando la persona se lo manda al bot y
-- vincula el chat_id automáticamente. No hace falta tocar el webhook para
-- nada de esto.
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

alter table public.profiles add column if not exists pending_telegram_code text;
alter table public.profiles add column if not exists pending_telegram_code_created_at timestamptz;

-- Para que el webhook encuentre rápido a qué perfil corresponde un código
-- recibido, sin recorrer toda la tabla.
create index if not exists profiles_pending_telegram_code_idx
  on public.profiles(pending_telegram_code)
  where pending_telegram_code is not null;
