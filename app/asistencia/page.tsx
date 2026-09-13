"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import type { AttendanceReason, AttendanceRecord, Availability } from "@/lib/types";
import { AVAILABILITY_LABELS } from "@/lib/types";

function AsistenciaContent() {
  const { profile, refreshProfile } = useAuth();
  // Los bomberos usan el QR como única vía; admin/guardia conservan el
  // botón manual también para su propia asistencia.
  const canMarkManually = profile?.role === "admin" || profile?.role === "guardia";

  const [openRecord, setOpenRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [reasons, setReasons] = useState<AttendanceReason[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!profile) return;
    setLoading(true);

    const { data: open } = await supabase
      .from("attendance")
      .select("*")
      .eq("firefighter_id", profile.id)
      .is("checked_out_at", null)
      .maybeSingle();

    const { data: recent } = await supabase
      .from("attendance")
      .select("*")
      .eq("firefighter_id", profile.id)
      .order("checked_in_at", { ascending: false })
      .limit(60);

    const { data: reasonsData } = await supabase
      .from("attendance_reasons")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");

    setOpenRecord((open as AttendanceRecord) ?? null);
    setHistory((recent as AttendanceRecord[]) ?? []);
    setReasons((reasonsData as AttendanceReason[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const handleCheckIn = async () => {
    if (!profile) return;
    if (!selectedReasonId) {
      setError("Elegí un motivo antes de marcar el ingreso.");
      return;
    }
    setError(null);
    setWorking(true);
    const { error: insertError } = await supabase.from("attendance").insert({
      organization_id: profile.organization_id,
      firefighter_id: profile.id,
      type: "cuartel",
      reason_id: selectedReasonId,
    });
    setWorking(false);
    if (insertError) {
      setError("No se pudo registrar el ingreso: " + insertError.message);
      return;
    }
    load();
  };

  const handleCheckOut = async () => {
    if (!openRecord) return;
    setError(null);
    setWorking(true);
    const { error: updateError } = await supabase
      .from("attendance")
      .update({ checked_out_at: new Date().toISOString() })
      .eq("id", openRecord.id);
    setWorking(false);
    if (updateError) {
      setError("No se pudo registrar la salida: " + updateError.message);
      return;
    }
    load();
  };

  const handleAvailability = async (value: Availability) => {
    if (!profile) return;
    setError(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ availability: value })
      .eq("id", profile.id);
    if (updateError) {
      setError("No se pudo actualizar la disponibilidad: " + updateError.message);
      return;
    }
    await refreshProfile();
  };

  const reasonName = (id: string | null) =>
    reasons.find((r) => r.id === id)?.name ?? "Sin motivo";

  const monthlySummary = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = history.filter((h) => {
      const checkedIn = new Date(h.checked_in_at);
      return checkedIn >= monthStart && h.checked_out_at;
    });

    let totalMinutes = 0;
    let totalPoints = 0;
    const byReason = new Map<string, { minutes: number; points: number; count: number }>();

    thisMonth.forEach((h) => {
      const start = new Date(h.checked_in_at).getTime();
      const end = new Date(h.checked_out_at as string).getTime();
      const minutes = Math.max(0, Math.round((end - start) / 60000));
      const reason = reasons.find((r) => r.id === h.reason_id);
      const points = reason?.points ?? 0;

      totalMinutes += minutes;
      totalPoints += points;

      const key = reason?.name ?? "Sin motivo";
      const prev = byReason.get(key) ?? { minutes: 0, points: 0, count: 0 };
      byReason.set(key, {
        minutes: prev.minutes + minutes,
        points: prev.points + points,
        count: prev.count + 1,
      });
    });

    return { totalMinutes, totalPoints, byReason, count: thisMonth.length };
  }, [history, reasons]);

  const formatHours = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">Mi asistencia</h1>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <p className="text-sm text-neutral-500">Tu disponibilidad</p>
        <div className="mt-2 flex gap-2">
          {(["disponible", "no_disponible"] as Availability[]).map((opt) => (
            <button
              key={opt}
              onClick={() => handleAvailability(opt)}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                profile?.availability === opt
                  ? "bg-brand text-white"
                  : "border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
              }`}
            >
              {AVAILABILITY_LABELS[opt]}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <p className="text-sm text-neutral-500">Estado en el cuartel</p>
        {loading ? (
          <p className="mt-2 text-sm text-neutral-500">Cargando…</p>
        ) : openRecord ? (
          <>
            <p className="mt-1 text-lg font-semibold text-brand">
              Presente desde{" "}
              {new Date(openRecord.checked_in_at).toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="text-sm text-neutral-500">
              Motivo: {reasonName(openRecord.reason_id)}
            </p>
            {canMarkManually ? (
              <button
                onClick={handleCheckOut}
                disabled={working}
                className="mt-3 rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-60"
              >
                {working ? "Registrando…" : "Marcar salida"}
              </button>
            ) : (
              <Link
                href="/escanear"
                className="mt-3 inline-block rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-900"
              >
                📷 Escanear QR para marcar salida
              </Link>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 text-lg font-semibold text-neutral-500">
              No estás en el cuartel
            </p>
            {canMarkManually ? (
              <>
                <label className="mt-3 block text-sm">
                  <span className="mb-1 block font-medium text-neutral-700">
                    Motivo del ingreso
                  </span>
                  <select
                    value={selectedReasonId}
                    onChange={(e) => setSelectedReasonId(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2"
                  >
                    <option value="">Elegí un motivo…</option>
                    {reasons.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={handleCheckIn}
                  disabled={working}
                  className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  {working ? "Registrando…" : "Marcar ingreso"}
                </button>
              </>
            ) : (
              <Link
                href="/escanear"
                className="mt-3 inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
              >
                📷 Escanear QR para marcar ingreso
              </Link>
            )}
          </>
        )}
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <p className="text-sm font-semibold text-neutral-800">
          Resumen de este mes
        </p>
        <div className="mt-3">
          <p className="text-xs text-neutral-500">Horas totales</p>
          <p className="text-2xl font-bold text-neutral-900">
            {formatHours(monthlySummary.totalMinutes)}
          </p>
        </div>
        {/* El puntaje de cada motivo solo se muestra en "Asistencia (todos)",
            no acá en la asistencia personal. */}
        {monthlySummary.byReason.size > 0 && (
          <div className="mt-4 space-y-1 border-t border-neutral-100 pt-3">
            {Array.from(monthlySummary.byReason.entries()).map(([name, v]) => (
              <div key={name} className="flex justify-between text-sm text-neutral-600">
                <span>
                  {name} <span className="text-neutral-400">({v.count})</span>
                </span>
                <span>{formatHours(v.minutes)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-4 py-3">
          <h2 className="font-semibold text-neutral-800">Últimos movimientos</h2>
        </div>
        {history.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">
            Todavía no tenés registros.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {history.slice(0, 10).map((h) => (
              <li key={h.id} className="px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-neutral-800">
                    {new Date(h.checked_in_at).toLocaleString("es-AR")}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {reasonName(h.reason_id)}
                  </span>
                </div>
                <span className="text-neutral-600">
                  →{" "}
                  {h.checked_out_at
                    ? new Date(h.checked_out_at).toLocaleString("es-AR")
                    : "en curso"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AsistenciaPage() {
  return (
    <ProtectedRoute section="asistencia">
      <AppShell>
        <AsistenciaContent />
      </AppShell>
    </ProtectedRoute>
  );
}
