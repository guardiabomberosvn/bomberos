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

function VincularTelegramContent() {
  const { profile, refreshProfile } = useAuth();
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const botUsername = getTelegramBotUsername();

  useEffect(() => {
    setCode(generateCode());
  }, []);

  const handleVerify = async () => {
    setError(null);
    setChecking(true);

    const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
    if (!token) {
      setError("El bot de Telegram todavía no está configurado en el sistema.");
      setChecking(false);
      return;
    }

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?limit=50`
      );
      const data = await res.json();

      if (!data.ok) {
        setError("No se pudo consultar Telegram: " + data.description);
        setChecking(false);
        return;
      }

      const match = (data.result as any[])
        .reverse()
        .find((u) => u.message?.text?.trim() === code);

      if (!match) {
        setError(
          "Todavía no encontramos tu mensaje. Verificá que lo hayas enviado al bot correcto y esperá unos segundos."
        );
        setChecking(false);
        return;
      }

      const chatId = String(match.message.chat.id);

      if (!profile) {
        setError("No se pudo identificar tu usuario.");
        setChecking(false);
        return;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ telegram_chat_id: chatId })
        .eq("id", profile.id);

      setChecking(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setSuccess(true);
      await refreshProfile();
    } catch (e) {
      setChecking(false);
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
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
            onClick={async () => {
              if (!profile) return;
              await supabase
                .from("profiles")
                .update({ telegram_chat_id: null })
                .eq("id", profile.id);
              await refreshProfile();
            }}
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
          {success && (
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              ¡Vinculado correctamente!
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
                {code}
              </div>
            </li>
            <li>Volvé acá y tocá "Ya envié el código".</li>
          </ol>

          <button
            onClick={handleVerify}
            disabled={checking}
            className="w-full rounded-md bg-brand py-2.5 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {checking ? "Verificando…" : "Ya envié el código"}
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
