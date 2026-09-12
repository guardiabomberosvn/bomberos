import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Se crea recién cuando llega una solicitud real (no al cargar el archivo),
// para evitar que el paso de build de Vercel falle si las variables de
// entorno todavía no están disponibles en ese momento.
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

async function answerCallback(callbackQueryId: string, text: string) {
  const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

async function editMessage(chatId: number, messageId: number, text: string) {
  const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    }),
  });
}

async function sendMessage(chatId: number, text: string) {
  const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

// ARREGLO DE SEGURIDAD: sin esto, cualquiera podía mandarle un POST fabricado
// a esta URL simulando una respuesta de Telegram (ej: marcar "acudo" en
// nombre de otra persona) sin necesidad de tocar el bot real. Telegram
// permite configurar un "secret_token" al registrar el webhook, que manda
// de vuelta en este header en cada request real — si no coincide, no es de
// Telegram. Queda opcional (si TELEGRAM_WEBHOOK_SECRET no está seteada, no
// se corta nada) para no romper el webhook actual hasta que se configure del
// lado de Telegram — ver supabase/README o el mensaje del chat para el paso
// de setWebhook con secret_token.
function isValidTelegramRequest(req: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  const received = req.headers.get("x-telegram-bot-api-secret-token");
  return received === expected;
}

// Vincula el chat de Telegram de quien mandó el mensaje con su perfil, si el
// texto que mandó coincide con un código de vinculación pendiente y todavía
// vigente (ver /vincular-telegram). Antes esto se resolvía desde el celular
// del admin usando "getUpdates", lo que obligaba a apagar el webhook cada vez
// (Telegram no deja usar getUpdates y webhook
