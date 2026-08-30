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

export async function POST(req: NextRequest) {
  if (!isValidTelegramRequest(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const update = await req.json();
  const callback = update.callback_query;

  // Solo nos interesan los toques de botón (callback_query). Otros mensajes
  // al bot (ej: /start, o el código de vinculación) los ignoramos acá.
  if (!callback) {
    return NextResponse.json({ ok: true });
  }

  const chatId: number = callback.message.chat.id;
  const messageId: number = callback.message.message_id;
  const data: string = callback.data ?? "";
  const [action, emergencyId] = data.split(":");

  if (!["acudo", "no_acudo"].includes(action) || !emergencyId) {
    await answerCallback(callback.id, "Botón no reconocido");
    return NextResponse.json({ ok: true });
  }

  // Buscar qué perfil tiene este chat_id vinculado.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, organization_id")
    .eq("telegram_chat_id", String(chatId))
    .maybeSingle();

  if (!profile) {
    await answerCallback(
      callback.id,
      "Tu cuenta no está vinculada. Abrí la app y volvé a vincular Telegram."
    );
    return NextResponse.json({ ok: true });
  }

  // Verificar que la emergencia siga activa y sea de la misma organización.
  const { data: emergency } = await supabaseAdmin
    .from("emergencies")
    .select("id, title, status, organization_id")
    .eq("id", emergencyId)
    .maybeSingle();

  if (!emergency || emergency.organization_id !== profile.organization_id) {
    await answerCallback(callback.id, "Emergencia no encontrada.");
    return NextResponse.json({ ok: true });
  }

  if (emergency.status !== "activa") {
    await answerCallback(callback.id, "Esta alerta ya no está activa.");
    await editMessage(
      chatId,
      messageId,
      `🚨 <b>${emergency.title}</b>\n\n(Esta alerta ya fue cerrada, tu respuesta no se registró.)`
    );
    return NextResponse.json({ ok: true });
  }

  const { error: upsertError } = await supabaseAdmin
    .from("emergency_responses")
    .upsert(
      {
        emergency_id: emergencyId,
        profile_id: profile.id,
        response: action,
        responded_at: new Date().toISOString(),
      },
      { onConflict: "emergency_id,profile_id" }
    );

  if (upsertError) {
    await answerCallback(callback.id, "Error al guardar tu respuesta.");
    return NextResponse.json({ ok: true });
  }

  const label = action === "acudo" ? "✅ ACUDO" : "❌ NO ACUDO";
  await answerCallback(callback.id, `Registrado: ${label}`);
  await editMessage(
    chatId,
    messageId,
    `🚨 <b>${emergency.title}</b>\n\nTu respuesta: <b>${label}</b>`
  );

  return NextResponse.json({ ok: true });
}
