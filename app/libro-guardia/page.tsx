"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { exportToExcel } from "@/lib/export";
import { StatsBarChart } from "@/components/StatsBarChart";
import type {
  AgendaEvent,
  GuardCall,
  GuardShift,
  GuardVisit,
  MovementReason,
  OtherForceNotice,
  Profile,
  Vehicle,
  VehicleMovement,
} from "@/lib/types";
import { MOVEMENT_REASON_LABELS, OTHER_FORCE_SERVICES } from "@/lib/types";

type Tab = "turno" | "llamadas" | "avisos" | "visitas" | "movimientos" | "agenda";

function LibroGuardiaContent() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>("turno");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">Libro de Guardia</h1>

      <div className="flex flex-wrap gap-1 border-b border-neutral-200">
        {(
          [
            ["turno", "Turno"],
            ["llamadas", "Llamadas"],
            ["avisos", "Avisos a otras fuerzas"],
            ["visitas", "Proveedores y visitas"],
            ["movimientos", "Movimientos de vehículos"],
            ["agenda", "Agenda"],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              tab === value
                ? "border-b-2 border-brand text-brand"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "turno" && profile && <TurnoTab myId={profile.id} />}
      {tab === "llamadas" && profile && <LlamadasTab myId={profile.id} />}
      {tab === "avisos" && profile && <AvisosTab myId={profile.id} />}
      {tab === "visitas" && profile && <VisitasTab myId={profile.id} />}
      {tab === "movimientos" && profile && <MovimientosTab myId={profile.id} />}
      {tab === "agenda" && profile && <AgendaTab myId={profile.id} />}
    </div>
  );
}

// ---------- Turno de guardia ----------
function TurnoTab({ myId }: { myId: string }) {
  const [openShift, setOpenShift] = useState<GuardShift | null>(null);
  const [recentShifts, setRecentShifts] = useState<GuardShift[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: open } = await supabase
      .from("guard_shifts")
      .select("*")
      .is("closed_at", null)
      .maybeSingle();
    const { data: recent } = await supabase
      .from("guard_shifts")
      .select("*")
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .limit(10);
    const { data: profiles } = await supabase.from("profiles").select("id, full_name");

    setNames(
      new Map(((profiles as { id: string; full_name: string }[]) ?? []).map((p) => [p.id, p.full_name]))
    );
    setOpenShift((open as GuardShift) ?? null);
    setRecentShifts((recent as GuardShift[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("guard-shifts")
      .on("postgres_changes", { event: "*", schema: "public", table: "guard_shifts" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const nameOf = (id: string) => names.get(id) ?? "—";

  const formatElapsed = (startIso: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(startIso).getTime()) / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const handleOpen = async () => {
    setError(null);
    setWorking(true);

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", myId)
      .single();

    const { error: insertError } = await supabase.from("guard_shifts").insert({
      organization_id: myProfile?.organization_id,
      opened_by: myId,
    });

    setWorking(false);
    if (insertError) {
      setError(
        insertError.message.includes("guard_shifts_one_open")
          ? "Ya hay un turno abierto — cerralo antes de abrir uno nuevo."
          : insertError.message
      );
      return;
    }
    load();
  };

  const handleClose = async () => {
    if (!openShift) return;
    setError(null);
    setWorking(true);

    const { error: updateError } = await supabase
      .from("guard_shifts")
      .update({
        closed_by: myId,
        closed_at: new Date().toISOString(),
        notes: closeNotes.trim() || null,
      })
      .eq("id", openShift.id);

    setWorking(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setShowCloseForm(false);
    setCloseNotes("");
    load();
  };

  const handleDeleteShift = async (shift: GuardShift) => {
    if (
      !window.confirm(
        "¿Eliminar este turno del historial? Esta acción no se puede deshacer."
      )
    )
      return;
    const { error: deleteError } = await supabase
      .from("guard_shifts")
      .delete()
      .eq("id", shift.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  return (
    <div className="space-y-4 pt-4">
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : openShift ? (
        <div className="rounded-xl border-2 border-brand bg-brand-light p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
            Turno abierto
          </p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{nameOf(openShift.opened_by)}</p>
          <p className="text-sm text-neutral-600">
            Desde las {new Date(openShift.opened_at).toLocaleString("es-AR")} · {formatElapsed(openShift.opened_at)} en curso
          </p>

          {!showCloseForm ? (
            <button
              onClick={() => setShowCloseForm(true)}
              className="mt-3 rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-900"
            >
              Cerrar turno
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <textarea
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder="Novedades para dejar asentadas (opcional)"
                rows={2}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCloseForm(false)}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleClose}
                  disabled={working}
                  className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  {working ? "Cerrando…" : "Confirmar cierre"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-5 text-center">
          <p className="text-sm text-neutral-600">No hay ningún turno abierto en este momento.</p>
          <button
            onClick={handleOpen}
            disabled={working}
            className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {working ? "Abriendo…" : "+ Abrir turno"}
          </button>
        </div>
      )}

      {recentShifts.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-2">
            <p className="text-sm font-semibold text-neutral-700">Turnos anteriores</p>
          </div>
          <ul className="divide-y divide-neutral-100">
            {recentShifts.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-neutral-800">
                    {nameOf(s.opened_by)}
                    {s.closed_by && s.closed_by !== s.opened_by
                      ? ` → cerrado por ${nameOf(s.closed_by)}`
                      : ""}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {new Date(s.opened_at).toLocaleString("es-AR")}
                    {s.closed_at ? ` — ${new Date(s.closed_at).toLocaleString("es-AR")}` : ""}
                  </p>
                  {s.notes && <p className="mt-1 text-neutral-600">{s.notes}</p>}
                </div>
                <button
                  onClick={() => handleDeleteShift(s)}
                  className="shrink-0 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- Llamadas ----------
function LlamadasTab({ myId }: { myId: string }) {
  const [calls, setCalls] = useState<GuardCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [callerName, setCallerName] = useState("");
  const [callerPhone, setCallerPhone] = useState("");
  const [reason, setReason] = useState("");
  const [derivedTo, setDerivedTo] = useState("");
  const [notes, setNotes] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("guard_calls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setCalls((data as GuardCall[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", myId)
      .single();

    // Si hay un turno abierto, la llamada queda asociada a ese turno.
    const { data: openShift } = await supabase
      .from("guard_shifts")
      .select("id")
      .eq("organization_id", myProfile?.organization_id)
      .is("closed_at", null)
      .maybeSingle();

    const { error: insertError } = await supabase.from("guard_calls").insert({
      organization_id: myProfile?.organization_id,
      caller_name: callerName.trim() || null,
      caller_phone: callerPhone.trim() || null,
      reason: reason.trim() || null,
      derived_to: derivedTo.trim() || null,
      notes: notes.trim() || null,
      taken_by: myId,
      status: derivedTo.trim() ? "derivada" : "abierta",
      shift_id: openShift?.id ?? null,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCallerName("");
    setCallerPhone("");
    setReason("");
    setDerivedTo("");
    setNotes("");
    setShowForm(false);
    load();
  };

  const handleClose = async (call: GuardCall) => {
    const { error: updateError } = await supabase
      .from("guard_calls")
      .update({ status: "cerrada", closed_at: new Date().toISOString() })
      .eq("id", call.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleDeleteCall = async (call: GuardCall) => {
    if (!window.confirm("¿Eliminar esta llamada?")) return;
    const { error: deleteError } = await supabase.from("guard_calls").delete().eq("id", call.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const handleExport = () => {
    exportToExcel(
      calls.map((c) => ({
        "Quién llamó": c.caller_name ?? "",
        Teléfono: c.caller_phone ?? "",
        Motivo: c.reason ?? "",
        "Derivado a": c.derived_to ?? "",
        Estado: c.status,
        Fecha: new Date(c.created_at).toLocaleString("es-AR"),
        Observaciones: c.notes ?? "",
      })),
      "llamadas",
      "Llamadas"
    );
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end gap-2">
        <button
          onClick={handleExport}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          📥 Exportar
        </button>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Registrar llamada
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
        >
          <input
            value={callerName}
            onChange={(e) => setCallerName(e.target.value)}
            placeholder="Quién llamó"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={callerPhone}
            onChange={(e) => setCallerPhone(e.target.value)}
            placeholder="Teléfono"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo"
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <input
            value={derivedTo}
            onChange={(e) => setDerivedTo(e.target.value)}
            placeholder="Derivado a (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark sm:col-span-2"
          >
            Guardar llamada
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Quién llamó</th>
              <th className="px-4 py-2 font-medium">Motivo</th>
              <th className="px-4 py-2 font-medium">Derivado a</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Cargando…
                </td>
              </tr>
            ) : calls.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Sin llamadas registradas.
                </td>
              </tr>
            ) : (
              calls.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-neutral-800">{c.caller_name ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">{c.reason ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">{c.derived_to ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">{c.status}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {new Date(c.created_at).toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      {c.status !== "cerrada" && (
                        <button
                          onClick={() => handleClose(c)}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          Cerrar
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteCall(c)}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Avisos a otras fuerzas ----------
const AVISOS_MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function AvisosTab({ myId }: { myId: string }) {
  const [notices, setNotices] = useState<OtherForceNotice[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [serviceName, setServiceName] = useState("");
  const [customService, setCustomService] = useState("");
  const [calledAt, setCalledAt] = useState("");
  const [code, setCode] = useState("");
  const [cause, setCause] = useState("");
  const [address, setAddress] = useState("");
  const [locality, setLocality] = useState("");
  const [notes, setNotes] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("other_force_notices")
      .select("*")
      .order("called_at", { ascending: false })
      .limit(200);
    const { data: profiles } = await supabase.from("profiles").select("id, full_name");
    setNames(
      new Map(((profiles as { id: string; full_name: string }[]) ?? []).map((p) => [p.id, p.full_name]))
    );
    setNotices((data as OtherForceNotice[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("other-force-notices")
      .on("postgres_changes", { event: "*", schema: "public", table: "other_force_notices" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const receivedByLabel = (n: OtherForceNotice) =>
    (n.taken_by && names.get(n.taken_by)) || n.received_by_name || "—";

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalService = serviceName === "__otro__" ? customService.trim() : serviceName;
    if (!finalService || !cause.trim()) return;
    setError(null);

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("organization_id, full_name")
      .eq("id", myId)
      .single();

    const { data: openShift } = await supabase
      .from("guard_shifts")
      .select("id")
      .eq("organization_id", myProfile?.organization_id)
      .is("closed_at", null)
      .maybeSingle();

    const { error: insertError } = await supabase.from("other_force_notices").insert({
      organization_id: myProfile?.organization_id,
      service_name: finalService,
      called_at: calledAt ? new Date(calledAt).toISOString() : new Date().toISOString(),
      code: code.trim() || null,
      cause: cause.trim(),
      address: address.trim() || null,
      locality: locality.trim() || null,
      received_by_name: myProfile?.full_name ?? null,
      taken_by: myId,
      shift_id: openShift?.id ?? null,
      notes: notes.trim() || null,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setServiceName("");
    setCustomService("");
    setCalledAt("");
    setCode("");
    setCause("");
    setAddress("");
    setLocality("");
    setNotes("");
    setShowForm(false);
    load();
  };

  const handleDelete = async (n: OtherForceNotice) => {
    if (!window.confirm("¿Eliminar este aviso?")) return;
    const { error: deleteError } = await supabase.from("other_force_notices").delete().eq("id", n.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const handleExport = () => {
    exportToExcel(
      notices.map((n) => ({
        "Servicio / Fuerzas": n.service_name,
        Fecha: new Date(n.called_at).toLocaleDateString("es-AR"),
        "Hs de llamado": new Date(n.called_at).toLocaleTimeString("es-AR"),
        Codigo: n.code ?? "",
        "Causa del llamado": n.cause,
        Direccion: n.address ?? "",
        Localidad: n.locality ?? "",
        "Guardia que recibió": receivedByLabel(n),
        Observaciones: n.notes ?? "",
      })),
      "avisos-otras-fuerzas",
      "Avisos"
    );
  };

  const currentYear = new Date().getFullYear();
  const stats = useMemo(() => {
    const thisYear = notices.filter((n) => new Date(n.called_at).getFullYear() === currentYear);
    const serviceCounts = new Map<string, number>();
    for (const n of thisYear) {
      serviceCounts.set(n.service_name, (serviceCounts.get(n.service_name) ?? 0) + 1);
    }
    const byService = Array.from(serviceCounts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const byMonth = AVISOS_MESES.map((label, idx) => ({
      label,
      value: thisYear.filter((n) => new Date(n.called_at).getMonth() === idx).length,
    }));

    return { total: thisYear.length, byService, byMonth };
  }, [notices, currentYear]);

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          onClick={handleExport}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          📥 Exportar
        </button>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Registrar aviso
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white">
        <button
          onClick={() => setShowStats((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <p className="text-sm font-semibold text-neutral-800">
            📊 Estadísticas {currentYear} · {stats.total} aviso{stats.total === 1 ? "" : "s"}
          </p>
          <span className="text-xs text-neutral-400">{showStats ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showStats && (
          <div className="grid grid-cols-1 gap-6 border-t border-neutral-100 px-4 py-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                Por servicio / fuerza
              </p>
              <StatsBarChart data={stats.byService} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Por mes</p>
              <StatsBarChart data={stats.byMonth} color="bg-orange-500" />
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
        >
          <select
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Servicio / fuerza…</option>
            {OTHER_FORCE_SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="__otro__">Otro (especificar)…</option>
          </select>
          {serviceName === "__otro__" && (
            <input
              value={customService}
              onChange={(e) => setCustomService(e.target.value)}
              placeholder="Nombre del servicio"
              required
              className="rounded-md border border-neutral-300 px-3 py-2"
            />
          )}
          <input
            type="datetime-local"
            value={calledAt}
            onChange={(e) => setCalledAt(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            placeholder="Causa del llamado"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Dirección"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={locality}
            onChange={(e) => setLocality(e.target.value)}
            placeholder="Localidad / barrio"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <button
            type="submit"
            className="rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark sm:col-span-2"
          >
            Guardar aviso
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Servicio</th>
              <th className="px-4 py-2 font-medium">Fecha / hora</th>
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Causa</th>
              <th className="px-4 py-2 font-medium">Localidad</th>
              <th className="px-4 py-2 font-medium">Recibió</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                  Cargando…
                </td>
              </tr>
            ) : notices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                  Sin avisos registrados.
                </td>
              </tr>
            ) : (
              notices.map((n) => (
                <tr key={n.id}>
                  <td className="px-4 py-2 text-neutral-800">{n.service_name}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {new Date(n.called_at).toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{n.code ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">{n.cause}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {n.address ? `${n.address}, ` : ""}
                    {n.locality ?? ""}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{receivedByLabel(n)}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleDelete(n)}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Proveedores y visitas ----------
function VisitasTab({ myId }: { myId: string }) {
  const [visits, setVisits] = useState<GuardVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [visitorName, setVisitorName] = useState("");
  const [reason, setReason] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("guard_visits")
      .select("*")
      .order("entered_at", { ascending: false })
      .limit(100);
    setVisits((data as GuardVisit[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitorName.trim()) return;
    setError(null);

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", myId)
      .single();

    const { error: insertError } = await supabase.from("guard_visits").insert({
      organization_id: myProfile?.organization_id,
      visitor_name: visitorName.trim(),
      reason: reason.trim() || null,
      registered_by: myId,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setVisitorName("");
    setReason("");
    setShowForm(false);
    load();
  };

  const handleExit = async (visit: GuardVisit) => {
    const { error: updateError } = await supabase
      .from("guard_visits")
      .update({ exited_at: new Date().toISOString() })
      .eq("id", visit.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleDeleteVisit = async (visit: GuardVisit) => {
    if (!window.confirm("¿Eliminar esta visita?")) return;
    const { error: deleteError } = await supabase.from("guard_visits").delete().eq("id", visit.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const inside = visits.filter((v) => !v.exited_at);

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Registrar visita
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
        >
          <input
            value={visitorName}
            onChange={(e) => setVisitorName(e.target.value)}
            placeholder="Persona / empresa"
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark sm:col-span-2"
          >
            Registrar ingreso
          </button>
        </form>
      )}

      {inside.length > 0 && (
        <div className="rounded-xl border border-brand bg-brand-light p-4">
          <p className="mb-2 text-sm font-semibold text-brand-dark">
            Actualmente dentro del cuartel
          </p>
          <ul className="space-y-1 text-sm">
            {inside.map((v) => (
              <li key={v.id} className="flex items-center justify-between">
                <span>{v.visitor_name}</span>
                <button
                  onClick={() => handleExit(v)}
                  className="rounded-md border border-neutral-400 bg-white px-2 py-1 text-xs font-medium hover:bg-neutral-100"
                >
                  Marcar egreso
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Persona / empresa</th>
              <th className="px-4 py-2 font-medium">Motivo</th>
              <th className="px-4 py-2 font-medium">Ingreso</th>
              <th className="px-4 py-2 font-medium">Egreso</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                  Cargando…
                </td>
              </tr>
            ) : visits.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                  Sin visitas registradas.
                </td>
              </tr>
            ) : (
              visits.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2 text-neutral-800">{v.visitor_name}</td>
                  <td className="px-4 py-2 text-neutral-600">{v.reason ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {new Date(v.entered_at).toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    {v.exited_at ? new Date(v.exited_at).toLocaleString("es-AR") : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleDeleteVisit(v)}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Movimientos de vehículos ----------
function MovimientosTab({ myId }: { myId: string }) {
  const [movements, setMovements] = useState<VehicleMovement[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [personal, setPersonal] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [reason, setReason] = useState<MovementReason>("otro");
  const [driverId, setDriverId] = useState("");
  const [departureKm, setDepartureKm] = useState("");
  const [returningMovement, setReturningMovement] = useState<VehicleMovement | null>(null);
  const [returnDateTime, setReturnDateTime] = useState("");
  const [returnKm, setReturnKm] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: m } = await supabase
      .from("vehicle_movements")
      .select("*")
      .order("departed_at", { ascending: false })
      .limit(100);
    const { data: v } = await supabase
      .from("vehicles")
      .select("*")
      .eq("is_active", true)
      .order("name");
    const { data: p } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .order("full_name");
    setMovements((m as VehicleMovement[]) ?? []);
    setVehicles((v as Vehicle[]) ?? []);
    setPersonal((p as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId) return;
    setError(null);

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", myId)
      .single();

    const { error: insertError } = await supabase.from("vehicle_movements").insert({
      organization_id: myProfile?.organization_id,
      vehicle_id: vehicleId,
      reason,
      driver_id: driverId || null,
      departure_km: departureKm ? Number(departureKm) : null,
      registered_by: myId,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setVehicleId("");
    setDriverId("");
    setDepartureKm("");
    setShowForm(false);
    load();
  };

  const openReturnModal = (m: VehicleMovement) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const defaultValue = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setReturnDateTime(defaultValue);
    setReturnKm("");
    setReturningMovement(m);
  };

  const confirmReturn = async () => {
    if (!returningMovement) return;
    const { error: updateError } = await supabase
      .from("vehicle_movements")
      .update({
        returned_at: returnDateTime ? new Date(returnDateTime).toISOString() : new Date().toISOString(),
        return_km: returnKm ? Number(returnKm) : null,
      })
      .eq("id", returningMovement.id);
    if (updateError) setError(updateError.message);
    setReturningMovement(null);
    load();
  };

  const handleDeleteMovement = async (m: VehicleMovement) => {
    if (!window.confirm("¿Eliminar este movimiento? No se puede deshacer.")) return;
    const { error: deleteError } = await supabase
      .from("vehicle_movements")
      .delete()
      .eq("id", m.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? "—";
  const driverName = (id: string | null) =>
    personal.find((p) => p.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Registrar salida
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {vehicles.length === 0 && (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-4 text-center text-sm text-neutral-500">
          No hay vehículos cargados todavía. Andá a "Vehículos" (solo admin) para crear alguno.
        </p>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
        >
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Vehículo…</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as MovementReason)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            {(Object.keys(MOVEMENT_REASON_LABELS) as MovementReason[]).map((r) => (
              <option key={r} value={r}>
                {MOVEMENT_REASON_LABELS[r]}
              </option>
            ))}
          </select>
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Chofer (opcional)</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={departureKm}
            onChange={(e) => setDepartureKm(e.target.value)}
            placeholder="Km de salida (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark sm:col-span-2"
          >
            Registrar salida
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Vehículo</th>
              <th className="px-4 py-2 font-medium">Motivo</th>
              <th className="px-4 py-2 font-medium">Chofer</th>
              <th className="px-4 py-2 font-medium">Salida</th>
              <th className="px-4 py-2 font-medium">Regreso</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Cargando…
                </td>
              </tr>
            ) : movements.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Sin movimientos registrados.
                </td>
              </tr>
            ) : (
              movements.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 text-neutral-800">{vehicleName(m.vehicle_id)}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {MOVEMENT_REASON_LABELS[m.reason]}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{driverName(m.driver_id)}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {new Date(m.departed_at).toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    {m.returned_at ? (
                      new Date(m.returned_at).toLocaleString("es-AR")
                    ) : (
                      <span className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-medium text-brand-dark">
                        En servicio
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      {!m.returned_at && (
                        <button
                          onClick={() => openReturnModal(m)}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          Marcar regreso
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteMovement(m)}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {returningMovement && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setReturningMovement(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold text-neutral-900">
              Marcar regreso
            </h2>
            <p className="mb-4 text-sm text-neutral-500">
              {vehicleName(returningMovement.vehicle_id)}
            </p>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">
                  Fecha y hora de regreso
                </span>
                <input
                  type="datetime-local"
                  value={returnDateTime}
                  onChange={(e) => setReturnDateTime(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">
                  Km de regreso (opcional)
                </span>
                <input
                  type="number"
                  value={returnKm}
                  onChange={(e) => setReturnKm(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setReturningMovement(null)}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                onClick={confirmReturn}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
              >
                Confirmar regreso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Agenda ----------
function AgendaTab({ myId }: { myId: string }) {
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventAt, setEventAt] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("agenda_events")
      .select("*")
      .order("event_at", { ascending: true });
    setEvents((data as AgendaEvent[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !eventAt) return;
    setError(null);

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", myId)
      .single();

    const { error: insertError } = await supabase.from("agenda_events").insert({
      organization_id: myProfile?.organization_id,
      title: title.trim(),
      description: description.trim() || null,
      event_at: new Date(eventAt).toISOString(),
      created_by: myId,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setTitle("");
    setDescription("");
    setEventAt("");
    setShowForm(false);
    load();
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm("¿Eliminar este evento?")) return;
    const { error: deleteError } = await supabase.from("agenda_events").delete().eq("id", eventId);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const upcoming = events.filter((e) => new Date(e.event_at) >= new Date());
  const past = events.filter((e) => new Date(e.event_at) < new Date());

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Nuevo evento
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            type="datetime-local"
            value={eventAt}
            onChange={(e) => setEventAt(e.target.value)}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (opcional)"
            rows={2}
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Guardar evento
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : (
        <>
          <div className="rounded-xl border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 px-4 py-2">
              <p className="text-sm font-semibold text-neutral-700">Próximos</p>
            </div>
            {upcoming.length === 0 ? (
              <p className="px-4 py-4 text-sm text-neutral-500">
                No hay eventos próximos.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {upcoming.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-neutral-800">{e.title}</p>
                      <p className="text-xs text-neutral-500">
                        {new Date(e.event_at).toLocaleString("es-AR")}
                      </p>
                      {e.description && (
                        <p className="mt-1 text-neutral-600">{e.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteEvent(e.id)}
                      className="shrink-0 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {past.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-white">
              <div className="border-b border-neutral-200 px-4 py-2">
                <p className="text-sm font-semibold text-neutral-700">Pasados</p>
              </div>
              <ul className="divide-y divide-neutral-100">
                {past.slice(0, 10).map((e) => (
                  <li key={e.id} className="px-4 py-3 text-sm text-neutral-500">
                    {e.title} — {new Date(e.event_at).toLocaleDateString("es-AR")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function LibroGuardiaPage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "guardia"]}>
      <AppShell>
        <LibroGuardiaContent />
      </AppShell>
    </ProtectedRoute>
  );
}
