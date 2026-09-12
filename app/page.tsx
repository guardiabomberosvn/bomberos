"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { getTelegramBotUsername } from "@/lib/telegram";

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// El código queda vigente 10 minutos. Si el bombero tarda más que eso en
// mandarlo, generamos uno nuevo automáticamente al volver a esta pantalla.
const CODE_LIFETIME_MS = 10 * 60 * 1000;

function VincularTelegramContent() {
  const { profile, refreshProfile } = useAuth();
  const [code, setCode] = useState("");
  const [preparing, setPreparing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const botUsername = getTelegramBotUsername();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Genera un código nuevo y lo guarda en el perfil (con vencimiento). El
  // webhook de Telegram es quien lo va a leer cuando el bombero lo mande por
  // el chat, y va a vincular el chat_id solo — acá no hace falta tocar nada
  // más ni prender/apagar el webhook.
  useEffect(() => {
    if (!profile || profile.telegram_chat_id) {
      setPreparing(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setPreparing(true);
      setError(null);
      const newCode = generateCode();
      const expiresAt = new Date(Date.now() + CODE_LIFETIME_MS).toISOString();

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ telegram_link_code: newCode, telegram_link_code_expires_at: expiresAt })
        .eq("id", profile.id);

      if (cancelled) return;

      if (updateError) {
        setError(updateError.message);
        setPreparing(false);
        return;
      }

      setCode(newCode);
      setPreparing(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.telegram_chat_id]);

  // Mientras esperamos que llegue el mensaje de Telegram, revisamos cada
  // pocos segundos si el perfil
