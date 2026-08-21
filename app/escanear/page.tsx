"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";
import type { AttendanceReason } from "@/lib/types";

type ScanState = "idle" | "scanning" | "processing" | "success" | "error";

function EscanearContent() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanningLockRef = useRef(false);

  const [state, setState] = useState<ScanState>("idle");
  const [message, setMessage] = useState<string>("");
  const [reasons, setReasons] = useState<AttendanceReason[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState<string>("");

  useEffect(() => {
    supabase
      .from("attendance_reasons")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setReasons((data as AttendanceReason[]) ?? []));
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const handleToken = useCallback(
    async (token: string) => {
      if (scanningLockRef.current) return;
      scanningLockRef.current = true;
      setState("processing");

      const { data, error } = await supabase.rpc("checkin_with_qr", {
        qr_token: token,
        p_reason_id: selectedReasonId || null,
      });

      if (error) {
        setState("error");
        setMessage(error.message || "No se pudo registrar. Probá de nuevo.");
        setTimeout(() => {
          scanningLockRef.current = false;
          setState("scanning");
        }, 2500);
        return;
      }

      const result = Array.isArray(data) ? data[0] : data;
      const action = result?.action === "ingreso" ? "Ingreso" : "Salida";
      setState("success");
      setMessage(`${action} registrado correctamente.`);
      stopCamera();
    },
    [stopCamera, selectedReasonId]
  );

  const scanLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code?.data) {
      handleToken(code.data);
      return;
    }

    rafRef.current = requestAnimationFrame(scanLoop);
  }, [handleToken]);

  const startCamera = useCallback(async () => {
    setMessage("");
    setState("scanning");
    scanningLockRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch {
      setState("error");
      setMessage(
        "No se pudo acceder a la cámara. Revisá los permisos del navegador."
      );
    }
  }, [scanLoop]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">Escanear QR</h1>
      <p className="text-sm text-neutral-500">
        Apuntá la cámara al QR que muestra la consola del cuartel. Se
        registra automáticamente tu ingreso o salida.
      </p>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-black">
        {state === "idle" && (
          <div className="flex aspect-square flex-col items-center justify-center gap-4 bg-neutral-900 p-6 text-center">
            <label className="w-full max-w-xs text-left text-sm">
              <span className="mb-1 block font-medium text-neutral-300">
                Motivo (solo si es tu ingreso)
              </span>
              <select
                value={selectedReasonId}
                onChange={(e) => setSelectedReasonId(e.target.value)}
                className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-white"
              >
                <option value="">Elegí un motivo…</option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-neutral-400 text-xs">
              Si estás marcando salida, el motivo no se usa.
            </p>
            <button
              onClick={startCamera}
              className="rounded-md bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-dark"
            >
              Activar cámara
            </button>
          </div>
        )}

        <div className={state === "scanning" || state === "processing" ? "relative aspect-square" : "hidden"}>
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-8 rounded-2xl border-4 border-white/70" />
          {state === "processing" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <p className="rounded-md bg-white px-4 py-2 text-sm font-medium">
                Registrando…
              </p>
            </div>
          )}
        </div>

        {state === "success" && (
          <div className="flex aspect-square flex-col items-center justify-center gap-3 bg-emerald-900 p-6 text-center">
            <p className="text-4xl">✅</p>
            <p className="font-medium text-white">{message}</p>
            <button
              onClick={() => setState("idle")}
              className="rounded-md border border-white/40 px-4 py-2 text-sm text-white hover:bg-white/10"
            >
              Escanear de nuevo
            </button>
          </div>
        )}

        {state === "error" && (
          <div className="flex aspect-square flex-col items-center justify-center gap-3 bg-red-950 p-6 text-center">
            <p className="text-4xl">⚠️</p>
            <p className="text-sm text-white">{message}</p>
            <button
              onClick={startCamera}
              className="rounded-md border border-white/40 px-4 py-2 text-sm text-white hover:bg-white/10"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

export default function EscanearPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <EscanearContent />
      </AppShell>
    </ProtectedRoute>
  );
}
