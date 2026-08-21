"use client";

import { useEffect, useRef, useState } from "react";
import type { Emergency } from "@/lib/types";

// Genera una sirena simple con la Web Audio API (barrido de tono en loop)
// — no depende de ningún archivo de audio externo.
// No suena para quien accionó la propia alarma (created_by === myProfileId).
export function EmergencySiren({
  emergencies,
  myProfileId,
}: {
  emergencies: Emergency[];
  myProfileId: string | undefined;
}) {
  const [enabled, setEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopFnRef = useRef<(() => void) | null>(null);

  const relevant = emergencies.filter((e) => e.created_by !== myProfileId);
  const active = relevant.length > 0;

  useEffect(() => {
    if (!enabled || !active) {
      stopFnRef.current?.();
      stopFnRef.current = null;
      return;
    }

    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = audioCtxRef.current ?? new AudioContextClass();
    audioCtxRef.current = ctx;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    let stopped = false;
    const sweep = () => {
      if (stopped) return;
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.linearRampToValueAtTime(1000, now + 0.6);
      osc.frequency.linearRampToValueAtTime(700, now + 1.2);
    };
    sweep();
    const interval = setInterval(sweep, 1200);

    stopFnRef.current = () => {
      stopped = true;
      clearInterval(interval);
      osc.stop();
      osc.disconnect();
      gain.disconnect();
    };

    return () => {
      stopFnRef.current?.();
      stopFnRef.current = null;
    };
  }, [enabled, active]);

  if (!active) return null;

  return (
    <button
      onClick={() => setEnabled((e) => !e)}
      className={`fixed bottom-4 right-4 z-30 rounded-full px-4 py-3 text-sm font-semibold shadow-lg ${
        enabled
          ? "bg-brand text-white"
          : "border-2 border-brand bg-white text-brand"
      }`}
    >
      {enabled ? "🔊 Sirena activada" : "🔇 Activar sirena"}
    </button>
  );
}
