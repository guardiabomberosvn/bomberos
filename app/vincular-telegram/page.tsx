"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { getTelegramBotUsername } from "@/lib/telegram";

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Vinculación automática: el código se guarda en el propio perfil
// (pending_telegram_code) y el webhook de Telegram (app/api/telegram-webhook)
// lo reconoce apenas la persona se lo manda al bot, vinculando el chat_id
// sin que haga falta volver a esta pantalla ni tocar ningún botón. Como
// AuthProvider ya tiene una suscripción en vivo al propio perfil, en cuanto
// el webhook actualiza telegram_chat_id esta pantalla lo detecta sola y
// cambia de estado — no hace falta pedirlo ni refrescar.
function VincularTelegramContent() {
  const { profile, refreshProfile } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const botUsername = getTelegramBotUsername();

  const generateAndSave = async () => {
    if (!profile) return;
    setGenerating(true);
    setError(null);
    const newCode = generateCode();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        pending_telegram_code: newCode,
        pending_telegram_code_created_at: new Date().toISOString(),
      })
      .eq("id", profile.id);
    setGenerating(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCode(newCode);
  };

  useEffect(() => {
    if (profile && !profile.telegram_chat_id && !code && !generating) {
      generateAndSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const handleUnlink = async () => {
    if (!profile) return;
    await supabase.from("profiles").update({ telegram_chat_id: null }).eq("id", profile.id);
    await refreshProfile();
    setCode(null);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        Recibir alertas por Telegram
      </h1>
      <p className="text-sm text-neutral-500">
        Vinculá tu cuenta de Telegram para recibir las alarmas de emergencia
        directo en tu celular, aunque no tengas esta app abierta.
      </p>

      {profile?.telegram_chat_id ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="font-medium text-emerald-800">
            ✅ Ya tenés Telegram vinculado
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            Vas a recibir las alarmas de emergencia por Telegram.
          </p>
          <button
            onClick={handleUnlink}
            className="mt-3 text-sm text-red-700 hover:underline"
          >
            Desvincular
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <ol className="list-inside list-decimal space-y-2 text-sm text-neutral-700">
            <li>
              Abrí Telegram y buscá{" "}
              {botUsername ? (
                <a
                  href={`https://t.me/${botUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand hover:underline"
                >
                  @{botUsername}
                </a>
              ) : (
                <span className="font-medium">el bot del cuartel</span>
              )}
              .
            </li>
            <li>Tocá "Iniciar" o enviale cualquier mensaje primero.</li>
            <li>
              Después enviale exactamente este código:
              <div className="mt-1 rounded-md bg-neutral-100 px-4 py-3 text-center text-2xl font-bold tracking-widest text-neutral-900">
                {code ?? "…"}
              </div>
            </li>
          </ol>

          <div className="flex items-center gap-2 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand" />
            Esperando que nos llegue el código… apenas lo recibamos, esto cambia solo.
          </div>

          <button
            onClick={generateAndSave}
            disabled={generating}
            className="text-sm text-neutral-500 hover:underline disabled:opacity-60"
          >
            {generating ? "Generando…" : "Generar otro código"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function VincularTelegramPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <VincularTelegramContent />
      </AppShell>
    </ProtectedRoute>
  );
}
