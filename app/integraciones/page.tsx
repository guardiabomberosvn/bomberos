"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";

interface WebhookStatus {
  expectedUrl: string;
  telegram: {
    url: string;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  } | null;
}

function IntegracionesContent() {
  const [status, setStatus] = useState<WebhookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const authHeader = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeader();
      const res = await fetch("/api/telegram-set-webhook", { headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo consultar el estado del webhook.");
        setStatus(null);
      } else {
        setStatus(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red.");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleReconnect = async () => {
    setReconnecting(true);
    setError(null);
    setSuccess(null);
    try {
      const headers = await authHeader();
      const res = await fetch("/api/telegram-set-webhook", { method: "POST", headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Telegram rechazó la solicitud.");
      } else {
        setSuccess("Webhook reconectado correctamente.");
        load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red.");
    }
    setReconnecting(false);
  };

  const registeredUrl = status?.telegram?.url ?? "";
  const isUpToDate = !!status && registeredUrl !== "" && registeredUrl === status.expectedUrl;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Integraciones</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Conexión del bot de Telegram del cuartel con este sitio.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-800">Webhook de Telegram</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Esta es la dirección a la que Telegram manda los avisos (respuestas ACUDO/NO ACUDO y
          los códigos para vincular el Telegram de cada bombero). Si el sitio se muda a otro
          dominio, el webhook queda apuntando al dominio viejo hasta que lo reconectes acá — ya
          no hace falta armar la URL a mano ni tocar el bot desde afuera.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-neutral-500">Consultando estado…</p>
        ) : (
          <div className="mt-4 space-y-2 text-sm">
            <p>
              <span className="font-medium text-neutral-700">Dirección esperada (este sitio):</span>{" "}
              <span className="break-all text-neutral-600">{status?.expectedUrl ?? "—"}</span>
            </p>
            <p>
              <span className="font-medium text-neutral-700">Dirección registrada en Telegram:</span>{" "}
              <span className="break-all text-neutral-600">
                {registeredUrl || "— (sin configurar)"}
              </span>
            </p>
            <p>
              <span className="font-medium text-neutral-700">Estado:</span>{" "}
              {isUpToDate ? (
                <span className="font-medium text-emerald-700">✅ Conectado y actualizado</span>
              ) : (
                <span className="font-medium text-orange-700">⚠️ Necesita reconectarse</span>
              )}
            </p>
            {status?.telegram?.last_error_message && (
              <p className="text-xs text-red-600">
                Último error de Telegram: {status.telegram.last_error_message}
              </p>
            )}
          </div>
        )}

        <button
          onClick={handleReconnect}
          disabled={reconnecting || loading}
          className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {reconnecting ? "Reconectando…" : "Reconectar webhook"}
        </button>
      </div>
    </div>
  );
}

export default function IntegracionesPage() {
  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <AppShell>
        <IntegracionesContent />
      </AppShell>
    </ProtectedRoute>
  );
}
