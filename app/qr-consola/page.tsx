"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { EmergencySiren } from "@/components/EmergencySiren";
import type { Emergency } from "@/lib/types";

// El QR se renueva cada 45 segundos: así una foto vieja del código no sirve
// para siempre, y si alguien lo comparte fuera del cuartel deja de ser válido rápido.
const SESSION_SECONDS = 45;

function QrConsolaContent() {
  const { profile } = useAuth();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [lastEvents, setLastEvents] = useState<
    { name: string; action: string; time: string }[]
  >([]);
  const [activeEmergencies, setActiveEmergencies] = useState<Emergency[]>([]);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    const loadEmergencies = async () => {
      const { data } = await supabase
        .from("emergencies")
        .select("*")
        .eq("status", "activa");
      setActiveEmergencies((data as Emergency[]) ?? []);
    };
    loadEmergencies();

    const channel = supabase
      .channel("qr-consola-emergencies")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emergencies" },
        () => loadEmergencies()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  const generateSession = useCallback(async () => {
    if (!profile) return;
    setError(null);

    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
    const { data, error: insertError } = await supabase
      .from("attendance_qr_sessions")
      .insert({
        organization_id: profile.organization_id,
        created_by: profile.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? "No se pudo generar el QR.");
      return;
    }

    tokenRef.current = data.token as string;
    const url = await QRCode.toDataURL(data.token as string, {
      width: 320,
      margin: 1,
    });
    setQrDataUrl(url);
    setSecondsLeft(SESSION_SECONDS);
  }, [profile]);

  useEffect(() => {
    generateSession();
    const renewInterval = setInterval(generateSession, SESSION_SECONDS * 1000);
    const tickInterval = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => {
      clearInterval(renewInterval);
      clearInterval(tickInterval);
    };
  }, [generateSession]);

  // Escucha en tiempo real las asistencias nuevas para mostrar feedback
  // ("Fulano marcó ingreso") sin recargar la pantalla.
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel("qr-consola-attendance")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attendance" },
        async (payload) => {
          const row = payload.new as { firefighter_id: string };
          const { data: person } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", row.firefighter_id)
            .maybeSingle();
          setLastEvents((prev) =>
            [
              {
                name: person?.full_name ?? "Alguien",
                action: "ingreso",
                time: new Date().toLocaleTimeString("es-AR"),
              },
              ...prev,
            ].slice(0, 8)
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "attendance" },
        async (payload) => {
          const row = payload.new as {
            firefighter_id: string;
            checked_out_at: string | null;
          };
          if (!row.checked_out_at) return;
          const { data: person } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", row.firefighter_id)
            .maybeSingle();
          setLastEvents((prev) =>
            [
              {
                name: person?.full_name ?? "Alguien",
                action: "salida",
                time: new Date().toLocaleTimeString("es-AR"),
              },
              ...prev,
            ].slice(0, 8)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  const progress = (secondsLeft / SESSION_SECONDS) * 100;

  return (
    <div className="-mx-4 -my-7 min-h-[calc(100vh-6.5rem)] rounded-2xl bg-ink-950 px-6 py-10 text-white sm:-mx-6">
      <EmergencySiren emergencies={activeEmergencies} myProfileId={profile?.id} />

      <div className="mx-auto max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">
          Consola de asistencia
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Escaneá para marcar entrada o salida
        </h1>
        <p className="mt-2 text-sm text-ink-400">
          Cada bombero escanea desde su celular en <strong className="text-white">Escanear QR</strong>.
          El código se renueva solo cada {SESSION_SECONDS}s.
        </p>
      </div>

      {error && (
        <div className="mx-auto mt-6 max-w-md rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/20">
          {error}
        </div>
      )}

      <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-5">
        <div className="relative flex w-full max-w-[19rem] items-center justify-center">
          <svg className="aspect-square w-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="2"
            />
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke="#dc2626"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 47}
              strokeDashoffset={2 * Math.PI * 47 * (1 - progress / 100)}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <div className="absolute flex aspect-square w-[92%] items-center justify-center rounded-2xl bg-white p-4 shadow-panel">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="Código QR de asistencia" className="h-full w-full" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-ink-400">
                Generando…
              </div>
            )}
          </div>
        </div>
        <p className="text-sm text-ink-400">
          Se renueva en <span className="font-mono text-white">{secondsLeft}s</span>
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-md overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
        <div className="border-b border-white/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-white">Últimos movimientos</h2>
        </div>
        {lastEvents.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-400">
            Todavía no hay escaneos en esta sesión.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {lastEvents.map((e, i) => (
              <li key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-medium text-white">{e.name}</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    e.action === "ingreso"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-white/10 text-ink-400"
                  }`}
                >
                  {e.action} · {e.time}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function QrConsolaPage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "guardia"]}>
      <AppShell>
        <QrConsolaContent />
      </AppShell>
    </ProtectedRoute>
  );
}
