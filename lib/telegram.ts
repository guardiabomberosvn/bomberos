/**
 * Envía un mensaje por el bot de Telegram del cuartel a un chat_id puntual.
 * El token del bot vive en NEXT_PUBLIC_TELEGRAM_BOT_TOKEN (.env.local).
 * Nota: al ser NEXT_PUBLIC, el token queda visible en el navegador. Es un
 * riesgo bajo para este uso (el bot solo puede mandar mensajes, no leer
 * datos), pero si en el futuro se quiere ocultarlo del todo, hay que mover
 * este envío a una función de servidor.
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: { inline_keyboard: { text: string; callback_data: string }[][] }
) {
  const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "Bot de Telegram no configurado" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    const data = await res.json();
    return { ok: data.ok === true, error: data.ok ? undefined : data.description };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}

/** Devuelve el chat_id que un usuario tiene que pegar en Telegram para vincularse (ver /vincular-telegram). */
export function getTelegramBotUsername() {
  return process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";
}
