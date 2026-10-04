"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { exportToExcel } from "@/lib/export";
import { hasSectionAccess } from "@/lib/permissions";
import type { AttendanceReason, AttendanceRecord, GuardShift, Profile } from "@/lib/types";

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
  // La carga rápida, la carga retroactiva y las acciones sobre registros
  // ajenos son para quien está de guardia (guardia, jefatura o admin) — un
  // bombero puede llegar a ver esta pantalla si se le habilita puntualmente,
  // pero nunca estos controles.
  const canManage =
    profile?.role === "admin" || profile?.role === "guardia" || profile?.role === "jefatura";
  // Borrar un registro de asistencia (no solo cerrarlo) queda para admin y
  // jefatura — pensado para limpiar pruebas, no para el uso diario de guardia.
  const canDeleteAttendance = profile?.role === "admin" || profile?.role === "jefatura";
  // Un guardia tiene que haber abierto turno en el Libro de Guardia antes de
  // poder tocar nada acá (carga rápida, retroactiva, cerrar o anotar algo
  // ajeno) — admin y jefatura no dependen de esto.
  const isGuardiaRole = profile?.role === "guardia";
  // Ver el resumen de horas/puntos y el ranking "Puntaje por persona" es un
  // permiso aparte (ver lib/permissions.ts) — tener acceso a esta página no
  // lo habilita solo.
  const canSeePuntajes = !!profile && hasSectionAccess(profile, "asistencia_puntajes");

  const [rows, setRows] = useState<Row[]>([]);
  const [personal, setPersonal] = useState<Profile[]>([]);
  const [reasons, setReasons] = useState<AttendanceReason[]>([]);
  const [openShift, setOpenShift] = useState<GuardShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPerson, setFilterPerson] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");

  // Carga rápida (un botón por bombero)
  const [quickOpenFor, setQuickOpenFor] = useState<string | null>(null);
  const [quickReasonId, setQuickReasonId] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);

  // Carga retroactiva (cuando alguien se olvidó de marcar)
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualPersonId, setManualPersonId] = useState("");
  const [manualReasonId, setManualReasonId] = useState("");
  const [manualCheckIn, setManualCheckIn] = useState("");
  const [manualCheckOut, setManualCheckOut] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualCloseAt, setManualCloseAt] = useState("");
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

    const { data: shift } = await supabase
      .from("guard_shifts")
      .select("*")
      .is("closed_at", null)
      .maybeSingle();

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
    setOpenShift((shift as GuardShift) ?? null);
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("asistencia-general")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "guard_shifts" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Nombre del guardia a dejar asentado en lo que se cargue desde esta
  // pantalla: el del turno de guardia abierto en el Libro de Guardia (no
  // la cuenta con la que esté logueado quien aprieta el botón, que en la
  // PC compartida del cuartel puede ser siempre la misma). Si no hay
  // ningún turno abierto, se avisa en vez de guardar un nombre que no es.
  const guardName = openShift
    ? openShift.opened_by_name?.trim() ||
      personal.find((p) => p.id === openShift.opened_by)?.full_name ||
      null
    : null;

  // Un guardia solo puede operar si hay turno abierto; admin y jefatura
  // pueden siempre (por ejemplo para corregir algo fuera de horario).
  const canOperateNow = canManage && (!isGuardiaRole || !!openShift);
  const guardiaBlockedByShift = isGuardiaRole && !openShift;

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

  // Puntaje por persona: uno por uno, no el total de todos juntos. Respeta
  // el rango de fechas elegido arriba, pero no el filtro de "Persona" (para
  // eso ya está el resumen de arriba) — acá se ve a todo el personal junto,
  // ordenado por puntaje.
  const perPersonSummary = useMemo(() => {
    const inRange = rows.filter((r) => {
      if (!r.checked_out_at) return false;
      const checkedIn = new Date(r.checked_in_at);
      if (filterFrom && checkedIn < new Date(filterFrom)) return false;
      if (filterTo) {
        const to = new Date(filterTo);
        to.setHours(23, 59, 59, 999);
        if (checkedIn > to) return false;
      }
      return true;
    });

    const byPerson = new Map<
      string,
      { id: string; name: string; minutes: number; points: number; count: number }
    >();
    personal.forEach((p) => {
      byPerson.set(p.id, { id: p.id, name: p.full_name, minutes: 0, points: 0, count: 0 });
    });

    inRange.forEach((r) => {
      const start = new Date(r.checked_in_at).getTime();
      const end = new Date(r.checked_out_at as string).getTime();
      const minutes = Math.max(0, Math.round((end - start) / 60000));
      const points = reasons.find((rs) => rs.id === r.reason_id)?.points ?? 0;
      const key = r.firefighter_id;
      const prev = byPerson.get(key) ?? {
        id: key,
        name: r.profile?.full_name ?? "—",
        minutes: 0,
        points: 0,
        count: 0,
      };
      byPerson.set(key, {
        id: prev.id,
        name: prev.name,
        minutes: prev.minutes + minutes,
        points: prev.points + points,
        count: prev.count + 1,
      });
    });

    return Array.from(byPerson.values()).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [rows, personal, reasons, filterFrom, filterTo]);

  const selectedPersonName =
    filterPerson !== "all"
      ? personal.find((p) => p.id === filterPerson)?.full_name
      : null;

  // Para la carga rápida: quién está adentro ahora mismo (según el registro
  // abierto más reciente) y quién no, entre el personal activo.
  const openByPerson = useMemo(() => {
    const map = new Map<string, Row>();
    rows.forEach((r) => {
      if (!r.checked_out_at) map.set(r.firefighter_id, r);
    });
    return map;
  }, [rows]);

  const notPresent = useMemo(
    () => personal.filter((p) => p.is_active && !openByPerson.has(p.id)),
    [personal, openByPerson]
  );
  const present = useMemo(
    () => personal.filter((p) => p.is_active && openByPerson.has(p.id)),
    [personal, openByPerson]
  );

  // Si la persona elegida en la carga retroactiva ya tiene un ingreso
  // abierto, no corresponde cargarle otro — lo que hace falta es ponerle
  // la hora de salida a ESE registro (que es, en la mayoría de los casos,
  // justo el motivo por el que se está usando esta carga retroactiva: se
  // olvidó de marcar la salida).
  const existingOpenForManual = manualPersonId ? openByPerson.get(manualPersonId) ?? null : null;

  const handleQuickCheckIn = async (personId: string) => {
    if (!quickReasonId) {
      setError("Elegí un motivo antes de confirmar el ingreso.");
      return;
    }
    setError(null);
    setQuickSaving(true);
    const person = personal.find((p) => p.id === personId);
    const { error: insertError } = await supabase.from("attendance").insert({
      organization_id: person?.organization_id,
      firefighter_id: personId,
      type: "cuartel",
      reason_id: quickReasonId,
      shift_id: openShift?.id ?? null,
      loaded_by_name: guardName,
    });
    setQuickSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setQuickOpenFor(null);
    setQuickReasonId("");
    load();
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPersonId || !manualReasonId || !manualCheckIn) {
      setError("Completá persona, motivo y hora de ingreso.");
      return;
    }
    // Mismo chequeo que ya hace la base de datos (la salida no puede ser
    // anterior al ingreso), pero acá avisamos antes de guardar en vez de
    // mostrar el error técnico de Supabase.
    if (manualCheckOut && new Date(manualCheckOut) < new Date(manualCheckIn)) {
      setError("La hora de salida no puede ser anterior a la de ingreso. Revisá la fecha.");
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
      shift_id: openShift?.id ?? null,
      loaded_by_name: guardName,
      notes: manualNotes.trim()
        ? `Carga retroactiva: se olvidó de marcar. ${manualNotes.trim()}`
        : "Carga retroactiva: se olvidó de marcar.",
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
    setManualNotes("");
    setShowManualForm(false);
    load();
  };

  // Ponerle la salida a un ingreso que ya estaba abierto (se olvidó de
  // marcar la salida) — actualiza ESE registro en vez de crear uno nuevo.
  const handleManualCloseExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingOpenForManual || !manualCloseAt) {
      setError("Elegí la hora de salida.");
      return;
    }
    if (new Date(manualCloseAt) < new Date(existingOpenForManual.checked_in_at)) {
      setError("La hora de salida no puede ser anterior a la del ingreso que ya tiene registrado.");
      return;
    }
    setError(null);
    setSaving(true);

    const extraNote = manualNotes.trim()
      ? `Carga retroactiva: se olvidó de marcar la salida. ${manualNotes.trim()}`
      : "Carga retroactiva: se olvidó de marcar la salida.";

    const { error: updateError } = await supabase
      .from("attendance")
      .update({
        checked_out_at: new Date(manualCloseAt).toISOString(),
        loaded_by_name: guardName,
        shift_id: openShift?.id ?? existingOpenForManual.shift_id,
        notes: existingOpenForManual.notes
          ? `${existingOpenForManual.notes} | ${extraNote}`
          : extraNote,
      })
      .eq("id", existingOpenForManual.id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setManualPersonId("");
    setManualCloseAt("");
    setManualNotes("");
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

  const handleDeleteRecord = async (row: Row) => {
    const label = `${row.profile?.full_name ?? "esta persona"} — ${new Date(
      row.checked_in_at
    ).toLocaleString("es-AR")}`;
    if (!window.confirm(`¿Eliminar este registro de asistencia (${label})? No se puede deshacer.`)) {
      return;
    }
    setError(null);
    const { error: deleteError } = await supabase.from("attendance").delete().eq("id", row.id);
    if (deleteError) setError(deleteError.message);
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
      "Cargado por": r.loaded_by_name ?? "Se registró solo/a",
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
          {canOperateNow && (
            <button
              onClick={() => setShowManualForm((s) => !s)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              📝 Carga retroactiva
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {guardiaBlockedByShift && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Tenés que abrir turno en el Libro de Guardia antes de poder cargar
          o modificar asistencia.{" "}
          <Link href="/libro-guardia" className="font-semibold underline">
            Ir a Libro de Guardia
          </Link>
        </div>
      )}

      {canManage && !isGuardiaRole && !openShift && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No hay ningún turno de guardia abierto en el Libro de Guardia. Lo
          que cargues acá va a quedar sin nombre de guardia hasta que
          alguien abra turno.
        </div>
      )}

      {canOperateNow && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-neutral-800">
            Carga rápida
          </p>

          {present.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase text-neutral-500">
                Adentro ahora — tocá para marcar salida
              </p>
              <div className="flex flex-wrap gap-2">
                {present.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      const row = openByPerson.get(p.id);
                      if (row) handleQuickClose(row);
                    }}
                    className="rounded-full bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-900"
                  >
                    {p.full_name} · salida
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="mb-2 text-xs font-medium uppercase text-neutral-500">
            Marcar ingreso
          </p>
          {notPresent.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No hay nadie activo sin registrar.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {notPresent.map((p) =>
                quickOpenFor === p.id ? (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-md border border-brand bg-brand-light px-3 py-2"
                  >
                    <span className="text-sm font-medium text-neutral-800">
                      {p.full_name}
                    </span>
                    <select
                      value={quickReasonId}
                      onChange={(e) => setQuickReasonId(e.target.value)}
                      autoFocus
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                    >
                      <option value="">Motivo…</option>
                      {reasons.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleQuickCheckIn(p.id)}
                      disabled={quickSaving || !quickReasonId}
                      className="rounded-md bg-brand px-3 py-1 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
                    >
                      {quickSaving ? "…" : "✅ Confirmar"}
                    </button>
                    <button
                      onClick={() => {
                        setQuickOpenFor(null);
                        setQuickReasonId("");
                      }}
                      className="text-sm text-neutral-500 hover:underline"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    key={p.id}
                    onClick={() => {
                      setQuickOpenFor(p.id);
                      setQuickReasonId("");
                    }}
                    className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    {p.full_name}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}

      {showManualForm && canOperateNow && (
        <form
          onSubmit={existingOpenForManual ? handleManualCloseExisting : handleManualSubmit}
          className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4"
        >
          <p className="text-sm font-medium text-neutral-700">
            Carga retroactiva — para cuando alguien se olvidó de marcar (la
            carga rápida de arriba es la forma normal de registrar asistencia)
          </p>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">
              Persona
            </span>
            <select
              value={manualPersonId}
              onChange={(e) => {
                setManualPersonId(e.target.value);
                setManualCloseAt("");
              }}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 sm:w-1/2"
            >
              <option value="">Elegí…</option>
              {personal.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>

          {existingOpenForManual ? (
            <>
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Ya tiene un ingreso abierto desde el{" "}
                {new Date(existingOpenForManual.checked_in_at).toLocaleString("es-AR")}.
                Elegí la hora en la que en realidad se fue, para ponerle la salida a ese
                mismo registro (no se crea uno nuevo).
              </p>
              <label className="block text-sm sm:w-1/2">
                <span className="mb-1 block font-medium text-neutral-700">
                  Hora de salida
                </span>
                <input
                  type="datetime-local"
                  value={manualCloseAt}
                  onChange={(e) => setManualCloseAt(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <div />
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
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">
              Observación (opcional)
            </span>
            <textarea
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              rows={2}
              placeholder='Ej: "se olvidó de marcar salida, confirmado por radio"'
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {saving
              ? "Guardando…"
              : existingOpenForManual
              ? "Guardar salida"
              : "Guardar registro"}
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

      {canSeePuntajes && (
        <>
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
            <div className="border-b border-neutral-200 px-4 py-3">
              <h2 className="font-semibold text-neutral-800">Puntaje por persona</h2>
              <p className="text-xs text-neutral-500">
                {filterFrom || filterTo
                  ? "Según el rango de fechas elegido arriba."
                  : "Histórico completo (elegí una fecha \"Desde\"/\"Hasta\" arriba para acotarlo)."}
              </p>
            </div>
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Persona</th>
                  <th className="px-4 py-3 font-medium">Horas</th>
                  <th className="px-4 py-3 font-medium">Puntos</th>
                  <th className="px-4 py-3 font-medium">Registros</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {perPersonSummary.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-neutral-500">
                      No hay personal cargado.
                    </td>
                  </tr>
                ) : (
                  perPersonSummary.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-medium text-neutral-800">{p.name}</td>
                      <td className="px-4 py-3 text-neutral-600">{formatHours(p.minutes)}</td>
                      <td className="px-4 py-3 font-semibold text-brand">{p.points}</td>
                      <td className="px-4 py-3 text-neutral-500">{p.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Persona</th>
              <th className="px-4 py-3 font-medium">Motivo</th>
              <th className="px-4 py-3 font-medium">Ingreso</th>
              <th className="px-4 py-3 font-medium">Salida</th>
              <th className="px-4 py-3 font-medium">Duración</th>
              <th className="px-4 py-3 font-medium">Cargado por</th>
              <th className="px-4 py-3 font-medium">Observaciones</th>
              {canOperateNow && <th className="px-4 py-3 font-medium">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-500">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-500">
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
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {r.loaded_by_name ?? "Se registró solo/a"}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{r.notes ?? "—"}</td>
                  {canOperateNow && (
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
                        {canDeleteAttendance && (
                          <button
                            onClick={() => handleDeleteRecord(r)}
                            className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Eliminar
                          </button>
                        )}
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
