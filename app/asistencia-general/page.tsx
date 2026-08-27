"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { exportToExcel } from "@/lib/export";
import type { AttendanceReason, AttendanceRecord, Profile } from "@/lib/types";

interface Row extends AttendanceRecord {
  profile?: Profile;
  reasonName?: string;
}

function toLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function AsistenciaGeneralContent() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [rows, setRows] = useState<Row[]>([]);
  const [personal, setPersonal] = useState<Profile[]>([]);
  const [reasons, setReasons] = useState<AttendanceReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPerson, setFilterPerson] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");

  // Carga manual / edición retroactiva
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualPersonId, setManualPersonId] = useState("");
  const [manualReasonId, setManualReasonId] = useState("");
  const [manualCheckIn, setManualCheckIn] = useState("");
  const [manualCheckOut, setManualCheckOut] = useState("");
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [observationText, setObservationText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name");

    const { data: attendance } = await supabase
      .from("attendance")
      .select("*")
      .order("checked_in_at", { ascending: false })
      .limit(300);

    const { data: reasonsData } = await supabase
      .from("attendance_reasons")
      .select("*")
      .order("sort_order");

    const profileMap = new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, p]));
    const reasonMap = new Map(
      ((reasonsData as AttendanceReason[]) ?? []).map((r) => [r.id, r.name])
    );

    const merged: Row[] = ((attendance as AttendanceRecord[]) ?? []).map((a) => ({
      ...a,
      profile: profileMap.get(a.firefighter_id),
      reasonName: a.reason_id ? reasonMap.get(a.reason_id) : undefined,
    }));

    setPersonal((profiles as Profile[]) ?? []);
    setReasons((reasonsData as AttendanceReason[]) ?? []);
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("asistencia-general")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterPerson !== "all" && r.firefighter_id !== filterPerson) return false;
      const checkedIn = new Date(r.checked_in_at);
      if (filterFrom && checkedIn < new Date(filterFrom)) return false;
      if (filterTo) {
        const to = new Date(filterTo);
        to.setHours(23, 59, 59, 999);
        if (checkedIn > to) return false;
      }
      return true;
    });
  }, [rows, filterPerson, filterFrom, filterTo]);

  const formatDuration = (row: Row) => {
    const start = new Date(row.checked_in_at).getTime();
    const end = row.checked_out_at ? new Date(row.checked_out_at).getTime() : Date.now();
    const minutes = Math.round((end - start) / 60000);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatHours = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  // Resumen de horas/puntos ya sumados, respetando los filtros de persona y
  // fecha elegidos arriba. Así el administrador puede buscar a un bombero y
  // ver de una el total, en vez de tener que sumar registro por registro.
  const summary = useMemo(() => {
    const closed = filtered.filter((r) => r.checked_out_at);
    let totalMinutes = 0;
    let totalPoints = 0;
    const byReason = new Map<string, { minutes: number; points: number; count: number }>();

    closed.forEach((r) => {
      const start = new Date(r.checked_in_at).getTime();
      const end = new Date(r.checked_out_at as string).getTime();
      const minutes = Math.max(0, Math.round((end - start) / 60000));
      const points = reasons.find((rs) => rs.id === r.reason_id)?.points ?? 0;

      totalMinutes += minutes;
      totalPoints += points;

      const key = r.reasonName ?? "Sin motivo";
      const prev = byReason.get(key) ?? { minutes: 0, points: 0, count: 0 };
      byReason.set(key, {
        minutes: prev.minutes + minutes,
        points: prev.points + points,
        count: prev.count + 1,
      });
    });

    return {
      totalMinutes,
      totalPoints,
      byReason,
      count: closed.length,
      openCount: filtered.length - closed.length,
    };
  }, [filtered, reasons]);

  const selectedPersonName =
    filterPerson !== "all"
      ? personal.find((p) => p.id === filterPerson)?.full_name
      : null;

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPersonId || !manualReasonId || !manualCheckIn) {
      setError("Completá persona, motivo y hora de ingreso.");
      return;
    }
    setError(null);
    setSaving(true);

    const person = personal.find((p) => p.id === manualPersonId);
    const { error: insertError } = await supabase.from("attendance").insert({
      organization_id: person?.organization_id,
      firefighter_id: manualPersonId,
      type: "cuartel",
      reason_id: manualReasonId,
      checked_in_at: new Date(manualCheckIn).toISOString(),
      checked_out_at: manualCheckOut ? new Date(manualCheckOut).toISOString() : null,
      notes: `Cargado manualmente por ${profile?.full_name}`,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setManualPersonId("");
    setManualReasonId("");
    setManualCheckIn("");
    setManualCheckOut("");
    setShowManualForm(false);
    load();
  };

  const handleQuickClose = async (row: Row) => {
    setError(null);
    const { error: updateError } = await supabase
      .from("attendance")
      .update({ checked_out_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleAddObservation = async () => {
    if (!editingRow) return;
    setSaving(true);
    setError(null);
    const newNotes = observationText.trim()
      ? `${editingRow.notes ? editingRow.notes + " | " : ""}${observationText.trim()}`
      : editingRow.notes;
    const { error: updateError } = await supabase
      .from("attendance")
      .update({ notes: newNotes })
      .eq("id", editingRow.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditingRow(null);
    setObservationText("");
    load();
  };

  const handleExport = () => {
    const data = filtered.map((r) => ({
      Persona: r.profile?.full_name ?? "—",
      Motivo: r.reasonName ?? "—",
      Ingreso: new Date(r.checked_in_at).toLocaleString("es-AR"),
      Salida: r.checked_out_at ? new Date(r.checked_out_at).toLocaleString("es-AR") : "En curso",
      Duración: formatDuration(r),
      Notas: r.notes ?? "",
    }));
    exportToExcel(data, "asistencia", "Asistencia");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-neutral-900">
          Asistencia — todo el personal
        </h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            📥 Exportar Excel
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowManualForm((s) => !s)}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              + Carga manual
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {showManualForm && isAdmin && (
        <form
          onSubmit={handleManualSubmit}
          className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4"
        >
          <p className="text-sm font-medium text-neutral-700">
            Cargar asistencia de alguien que se olvidó de marcar
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">
                Persona
              </span>
              <select
                value={manualPersonId}
                onChange={(e) => setManualPersonId(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              >
                <option value="">Elegí…</option>
                {personal.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">
                Motivo
              </span>
              <select
                value={manualReasonId}
                onChange={(e) => setManualReasonId(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              >
                <option value="">Elegí…</option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">
                Hora de ingreso
              </span>
              <input
                type="datetime-local"
                value={manualCheckIn}
                onChange={(e) => setManualCheckIn(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">
                Hora de salida (opcional)
              </span>
              <input
                type="datetime-local"
                value={manualCheckOut}
                onChange={(e) => setManualCheckOut(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar registro"}
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-neutral-700">Persona</span>
          <select
            value={filterPerson}
            onChange={(e) => setFilterPerson(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1.5"
          >
            <option value="all">Todos</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-neutral-700">Desde</span>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-neutral-700">Hasta</span>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1.5"
          />
        </label>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <p className="text-sm font-semibold text-neutral-800">
          {selectedPersonName
            ? `Resumen de ${selectedPersonName}`
            : "Resumen general (todos, según filtros)"}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-neutral-500">Horas totales</p>
            <p className="text-2xl font-bold text-neutral-900">
              {formatHours(summary.totalMinutes)}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Puntos totales</p>
            <p className="text-2xl font-bold text-brand">{summary.totalPoints}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Registros contados</p>
            <p className="text-2xl font-bold text-neutral-900">{summary.count}</p>
          </div>
        </div>
        {summary.openCount > 0 && (
          <p className="mt-2 text-xs text-neutral-400">
            {summary.openCount} registro(s) todavía en curso — no se suman hasta que se marque la salida.
          </p>
        )}
        {summary.byReason.size > 0 && (
          <div className="mt-4 space-y-1 border-t border-neutral-100 pt-3">
            {Array.from(summary.byReason.entries()).map(([name, v]) => (
              <div key={name} className="flex justify-between text-sm text-neutral-600">
                <span>
                  {name} <span className="text-neutral-400">({v.count})</span>
                </span>
                <span>
                  {formatHours(v.minutes)} · {v.points} pts
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Persona</th>
              <th className="px-4 py-3 font-medium">Motivo</th>
              <th className="px-4 py-3 font-medium">Ingreso</th>
              <th className="px-4 py-3 font-medium">Salida</th>
              <th className="px-4 py-3 font-medium">Duración</th>
              <th className="px-4 py-3 font-medium">Observaciones</th>
              {isAdmin && <th className="px-4 py-3 font-medium">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                  No hay registros con estos filtros.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-neutral-800">
                    {r.profile?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {r.reasonName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {new Date(r.checked_in_at).toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {r.checked_out_at ? (
                      new Date(r.checked_out_at).toLocaleString("es-AR")
                    ) : (
                      <span className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-medium text-brand-dark">
                        En curso
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{formatDuration(r)}</td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{r.notes ?? "—"}</td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {!r.checked_out_at && (
                          <button
                            onClick={() => handleQuickClose(r)}
                            className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                          >
                            Cerrar ahora
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditingRow(r);
                            setObservationText("");
                          }}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          + Observación
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingRow && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setEditingRow(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold text-neutral-900">
              Agregar observación
            </h2>
            <p className="mb-4 text-sm text-neutral-500">
              {editingRow.profile?.full_name} —{" "}
              {new Date(editingRow.checked_in_at).toLocaleString("es-AR")}
            </p>
            <p className="mb-3 text-xs text-neutral-400">
              El horario y motivo del registro no se pueden modificar. Esto solo
              agrega una nota (ej: "se olvidó de marcar salida, confirmado por radio").
            </p>
            {editingRow.notes && (
              <div className="mb-3 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                <span className="font-medium">Observaciones actuales:</span> {editingRow.notes}
              </div>
            )}
            <textarea
              value={observationText}
              onChange={(e) => setObservationText(e.target.value)}
              rows={3}
              placeholder="Escribí la observación…"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditingRow(null)}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddObservation}
                disabled={saving || !observationText.trim()}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar observación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
}

export default function AsistenciaGeneralPage() {
  return (
    <ProtectedRoute section="asistencia_general">
      <AppShell>
        <AsistenciaGeneralContent />
      </AppShell>
    </ProtectedRoute>
  );
}
