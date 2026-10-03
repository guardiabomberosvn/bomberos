import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram";

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

// Este endpoint es lo único que Telegram sabe llamar cuando alguien toca un
// botón (por ejemplo ✅ ACUDO / ❌ NO ACUDO en una convocatoria de
// emergencia): le manda acá un POST con el "update". Si esta función no
// existe (como pasó hasta ahora — el archivo se había quedado a medio
// escribir), Next.js devuelve 405 "Method Not Allowed" para cualquier POST,
// que es exactamente el error que veía Telegram en Integraciones.
export async function POST(request: NextRequest) {
  if (!isValidTelegramRequest(request)) {
    // No confirmamos ni negamos nada para no dar pistas: simplemente se
    // ignora como si el update nunca hubiera llegado.
    return NextResponse.json({ ok: true });
  }

  const update = await request.json().catch(() => null);
  if (!update) {
    return NextResponse.json({ ok: true });
  }

  const supabase = getSupabaseAdmin();

  // Respuesta a los botones ACUDO / NO ACUDO de una convocatoria de
  // emergencia (ver DispatchModal, callback_data = "acudo:<id>" o
  // "no_acudo:<id>").
  if (update.callback_query) {
    const callbackQuery = update.callback_query as {
      id: string;
      data?: string;
      message?: { chat?: { id?: number }; message_id?: number; text?: string };
    };

    const data = callbackQuery.data ?? "";
    const [action, emergencyId] = data.split(":");
    const chatId = callbackQuery.message?.chat?.id;
    const messageId = callbackQuery.message?.message_id;

    if ((action === "acudo" || action === "no_acudo") && emergencyId && chatId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("telegram_chat_id", String(chatId))
        .maybeSingle();

      if (!profile) {
        await answerCallback(
          callbackQuery.id,
          "Tu Telegram no está vinculado a ningún usuario del sistema."
        );
        return NextResponse.json({ ok: true });
      }

      const { error: upsertError } = await supabase
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
        await answerCallback(
          callbackQuery.id,
          "No se pudo registrar tu respuesta, probá de nuevo en un momento."
        );
        return NextResponse.json({ ok: true });
      }

      const label = action === "acudo" ? "✅ ACUDO" : "❌ NO ACUDO";
      await answerCallback(callbackQuery.id, `Registrado: ${label}`);

      if (messageId) {
        const original = callbackQuery.message?.text ?? "";
        await editMessage(
          chatId,
          messageId,
          `${original}\n\n${label} — ${profile.full_name}`
        );
      }
    } else {
      // El botón ya no corresponde a nada que sepamos procesar (formato
      // viejo o desconocido) — avisamos sin romper nada del lado de
      // Telegram.
      await answerCallback(callbackQuery.id, "No se pudo procesar esta respuesta.");
    }

    return NextResponse.json({ ok: true });
  }

  // Vinculación de Telegram: cuando alguien le manda al bot el código de 6
  // dígitos que le mostró /vincular-telegram, se linkea el chat_id al
  // perfil que generó ese código — automático, sin que la persona tenga
  // que volver a la app ni tocar ningún botón, y sin que haga falta sacar
  // el webhook (antes esto se resolvía con "getUpdates" desde el
  // navegador, que no puede convivir con el webhook activo).
  if (update.message) {
    const message = update.message as {
      text?: string;
      chat?: { id?: number };
    };
    const text = (message.text ?? "").trim();
    const chatId = message.chat?.id;

    if (chatId && /^\d{6}$/.test(text)) {
      const CODE_TTL_MS = 10 * 60 * 1000;

      const { data: candidates } = await supabase
        .from("profiles")
        .select("id, full_name, pending_telegram_code_created_at")
        .eq("pending_telegram_code", text)
        .order("pending_telegram_code_created_at", { ascending: false })
        .limit(1);

      const candidate = candidates?.[0];
      const stillValid =
        !!candidate?.pending_telegram_code_created_at &&
        Date.now() - new Date(candidate.pending_telegram_code_created_at).getTime() < CODE_TTL_MS;

      if (candidate && stillValid) {
        await supabase
          .from("profiles")
          .update({
            telegram_chat_id: String(chatId),
            pending_telegram_code: null,
            pending_telegram_code_created_at: null,
          })
          .eq("id", candidate.id);

        await sendTelegramMessage(
          String(chatId),
          `✅ Listo, ${candidate.full_name}. Tu Telegram quedó vinculado a tu cuenta del sistema.`
        );
      } else {
        await sendTelegramMessage(
          String(chatId),
          "Ese código no es válido o ya venció. Generá uno nuevo desde la app, en \"Vincular Telegram\"."
        );
      }
    }

    return NextResponse.json({ ok: true });
  }

  // Cualquier otro tipo de update se reconoce con 200 para que Telegram no
  // marque el webhook como roto.
  return NextResponse.json({ ok: true });
}
