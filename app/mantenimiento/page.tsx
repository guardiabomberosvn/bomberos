"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { getMaintenanceAlertLevel, notifyResponsible } from "@/lib/maintenance";
import { MaintenanceDetailModal } from "@/components/MaintenanceDetailModal";
import { MaintenancePreviewModal } from "@/components/MaintenancePreviewModal";
import type {
  MaintenanceFinding,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
  Profile,
  Vehicle,
} from "@/lib/types";
import {
  MAINTENANCE_ALERT_LABELS,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_TYPE_LABELS,
} from "@/lib/types";

const ALERT_COLORS: Record<string, string> = {
  completado: "bg-emerald-50 text-emerald-700",
  en_termino: "bg-emerald-50 text-emerald-700",
  proximo: "bg-amber-50 text-amber-700",
  muy_proximo: "bg-orange-50 text-orange-700",
  vencido: "bg-red-50 text-red-700",
};

function MantenimientoContent() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [personal, setPersonal] = useState<Profile[]>([]);
  const [findings, setFindings] = useState<MaintenanceFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [type, setType] = useState<MaintenanceType>("preventivo");
  const [work, setWork] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [targetKm, setTargetKm] = useState("");
  const [cost, setCost] = useState("");
  const [detailRecord, setDetailRecord] = useState<MaintenanceRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<MaintenanceRecord | null>(null);

  // Si venimos desde Flota con "Programar service", preseleccionamos el
  // vehículo y abrimos el formulario directo.
  useEffect(() => {
    const preselected = searchParams.get("vehicle");
    if (preselected) {
      setVehicleId(preselected);
      setWork("Service programado");
      setShowForm(true);
    }
  }, [searchParams]);

  const load = async () => {
    setLoading(true);
    const { data: m } = await supabase
      .from("maintenance_records")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: v } = await supabase.from("vehicles").select("*").order("name");
    const { data: p } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .order("full_name");
    const { data: fd } = await supabase
      .from("maintenance_findings")
      .select("*")
      .not("converted_maintenance_id", "is", null);
    setRecords((m as MaintenanceRecord[]) ?? []);
    setVehicles((v as Vehicle[]) ?? []);
    setPersonal((p as Profile[]) ?? []);
    setFindings((fd as MaintenanceFinding[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const vehicleName = (id: string | null) =>
    id ? vehicles.find((v) => v.id === id)?.name ?? "—" : "—";

  const findingFor = (recordId: string) =>
    findings.find((f) => f.converted_maintenance_id === recordId) ?? null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!work.trim() || !profile) return;
    setError(null);

    const responsiblePerson = personal.find((p) => p.id === responsibleId);
    const targetKmValue = targetKm.trim() ? Number(targetKm) : null;
    const costValue = cost.trim() ? Number(cost) : null;
    if (targetKm.trim() && Number.isNaN(targetKmValue)) {
      setError("El km objetivo tiene que ser un número.");
      return;
    }
    if (cost.trim() && Number.isNaN(costValue)) {
      setError("El precio tiene que ser un número.");
      return;
    }

    const { error: insertError } = await supabase.from("maintenance_records").insert({
      organization_id: profile.organization_id,
      vehicle_id: vehicleId || null,
      type,
      work: work.trim(),
      responsible_id: responsibleId || null,
      responsible: responsiblePerson?.full_name ?? null,
      target_date: targetDate || null,
      target_km: targetKmValue,
      cost: costValue,
      created_by: profile.id,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    // Aviso por Telegram a la persona asignada como responsable (si tiene
    // el Telegram vinculado). No bloqueamos el formulario esperando esto.
    if (responsiblePerson) {
      notifyResponsible(
        responsiblePerson,
        `🔧 <b>Se te asignó una orden de mantenimiento</b>\n` +
          `${work.trim()}${vehicleId ? " — " + vehicleName(vehicleId) : ""}\n` +
          (targetDate ? `Fecha objetivo: ${targetDate}\n` : "") +
          (targetKmValue != null ? `Km objetivo: ${targetKmValue.toLocaleString("es-AR")}\n` : "") +
          `Revisala en la app, sección Mantenimiento.`
      );
    }

    setVehicleId("");
    setWork("");
    setResponsibleId("");
    setTargetDate("");
    setTargetKm("");
    setCost("");
    setShowForm(false);
    load();
  };

  const handleStatusChange = async (r: MaintenanceRecord, status: MaintenanceStatus) => {
    setError(null);
    const { error: updateError } = await supabase
      .from("maintenance_records")
      .update({
        status,
        completed_at: status === "completado" ? new Date().toISOString() : null,
      })
      .eq("id", r.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    if (r.vehicle_id) {
      if (status === "en_proceso") {
        await supabase
          .from("vehicles")
          .update({ status: "mantenimiento" })
          .eq("id", r.vehicle_id);
      } else if (status === "completado") {
        const { data: otherOpen } = await supabase
          .from("maintenance_records")
          .select("id")
          .eq("vehicle_id", r.vehicle_id)
          .eq("status", "en_proceso")
          .neq("id", r.id);
        if (!otherOpen || otherOpen.length === 0) {
          await supabase
            .from("vehicles")
            .update({ status: "disponible" })
            .eq("id", r.vehicle_id);
        }
      }
    }
    load();
  };

  const handleTargetDateUpdate = async (r: MaintenanceRecord, targetDateValue: string) => {
    const newValue = targetDateValue || null;
    // Antes esto se disparaba con cada click afuera del campo, aunque no se
    // hubiera cambiado la fecha — y como reiniciaba el aviso ya mandado, eso
    // era lo que hacía que llegaran avisos de mantenimiento duplicados. Ahora
    // solo reinicia el aviso cuando la fecha realmente cambió (así, si la
    // orden vuelve a acercarse al vencimiento, sí avisa de nuevo).
    if (newValue === r.target_date) return;
    const { error: updateError } = await supabase
      .from("maintenance_records")
      .update({ target_date: newValue, alert_checkpoint: null })
      .eq("id", r.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleResponsibleChange = async (r: MaintenanceRecord, newResponsibleId: string) => {
    if (newResponsibleId === (r.responsible_id ?? "")) return;
    const responsiblePerson = personal.find((p) => p.id === newResponsibleId);
    const { error: updateError } = await supabase
      .from("maintenance_records")
      .update({
        responsible_id: newResponsibleId || null,
        responsible: responsiblePerson?.full_name ?? null,
      })
      .eq("id", r.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (responsiblePerson) {
      notifyResponsible(
        responsiblePerson,
        `🔧 <b>Se te asignó una orden de mantenimiento</b>\n` +
          `${r.work}${r.vehicle_id ? " — " + vehicleName(r.vehicle_id) : ""}\n` +
          (r.target_date ? `Fecha objetivo: ${r.target_date}\n` : "") +
          `Revisala en la app, sección Mantenimiento.`
      );
    }
    load();
  };

  const handleDelete = async (r: MaintenanceRecord) => {
    if (!window.confirm(`¿Eliminar la orden "${r.work}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    const { error: deleteError } = await supabase
      .from("maintenance_records")
      .delete()
      .eq("id", r.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const pending = records.filter((r) => r.status !== "completado");
  const completed = records.filter((r) => r.status === "completado");
  const totalSpent = records.reduce((sum, r) => sum + (r.cost ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-neutral-900">Mantenimiento</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Nueva orden
        </button>
      </div>

      {totalSpent > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <p className="text-xs text-neutral-500">Total gastado en mantenimiento</p>
          <p className="text-lg font-bold text-neutral-900">
            ${totalSpent.toLocaleString("es-AR")}
          </p>
        </div>
      )}

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
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Vehículo (opcional)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as MaintenanceType)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            {(Object.keys(MAINTENANCE_TYPE_LABELS) as MaintenanceType[]).map((t) => (
              <option key={t} value={t}>
                {MAINTENANCE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            value={work}
            onChange={(e) => setWork(e.target.value)}
            placeholder="Trabajo, ej: Cambio de aceite"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <select
            value={responsibleId}
            onChange={(e) => setResponsibleId(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Personal encargado (opcional)</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="Precio (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <label className="text-xs sm:col-span-2">
            <span className="mb-1 block text-neutral-500">
              Próximo service — por fecha y/o por km (lo que corresponda)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={targetKm}
                onChange={(e) => setTargetKm(e.target.value)}
                placeholder="Km objetivo"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark sm:col-span-2"
          >
            Guardar orden
          </button>
        </form>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">Pendientes</h2>
        {loading ? (
          <p className="text-sm text-neutral-500">Cargando…</p>
        ) : pending.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
            No hay órdenes pendientes.
          </p>
        ) : (
          pending.map((r) => {
            const level = getMaintenanceAlertLevel(
              r,
              vehicles.find((v) => v.id === r.vehicle_id)?.km
            );
            const finding = findingFor(r.id);
            return (
              <div key={r.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailRecord(r)}
                    className="text-left"
                  >
                    <p className="font-medium text-neutral-800 hover:underline">
                      {r.work} <span className="text-neutral-400">— {vehicleName(r.vehicle_id)}</span>
                    </p>
                    <p className="text-xs text-neutral-500">
                      {MAINTENANCE_TYPE_LABELS[r.type]}
                      {finding ? " · 🚧 desde un hallazgo" : ""}
                    </p>
                  </button>
                  {!r.target_date && r.target_km == null ? (
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-500">
                      Sin fecha/km definido
                    </span>
                  ) : (
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${ALERT_COLORS[level]}`}>
                      {MAINTENANCE_ALERT_LABELS[level]}
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="text-xs">
                    <span className="mb-1 block text-neutral-500">Fecha objetivo</span>
                    <input
                      type="date"
                      defaultValue={r.target_date ?? ""}
                      onBlur={(e) => handleTargetDateUpdate(r, e.target.value)}
                      className="w-full rounded-md border border-neutral-300 px-2 py-1"
                    />
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block text-neutral-500">Personal encargado</span>
                    <select
                      value={r.responsible_id ?? ""}
                      onChange={(e) => handleResponsibleChange(r, e.target.value)}
                      className="w-full rounded-md border border-neutral-300 px-2 py-1"
                    >
                      <option value="">Sin asignar</option>
                      {personal.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={r.status}
                    onChange={(e) =>
                      handleStatusChange(r, e.target.value as MaintenanceStatus)
                    }
                    className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                  >
                    {(Object.keys(MAINTENANCE_STATUS_LABELS) as MaintenanceStatus[]).map(
                      (s) => (
                        <option key={s} value={s}>
                          {MAINTENANCE_STATUS_LABELS[s]}
                        </option>
                      )
                    )}
                  </select>
                  {r.vehicle_id && r.status !== "en_proceso" && (
                    <p className="text-xs text-neutral-400">
                      Al pasar a "En proceso" el vehículo se marca en mantenimiento
                    </p>
                  )}
                  <button
                    onClick={() => setDetailRecord(r)}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    📋 Ver detalle
                  </button>
                  <button
                    onClick={() => setPreviewRecord(r)}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    👁️ Vista previa
                  </button>
                  <button
                    onClick={() => handleDelete(r)}
                    className="ml-auto rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {completed.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase text-neutral-500">Completadas</h2>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Trabajo</th>
                  <th className="px-4 py-2 font-medium">Vehículo</th>
                  <th className="px-4 py-2 font-medium">Completado</th>
                  <th className="px-4 py-2 font-medium">Precio</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {completed.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => setDetailRecord(r)}
                        className="text-left text-neutral-800 hover:underline"
                      >
                        {r.work}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-neutral-600">{vehicleName(r.vehicle_id)}</td>
                    <td className="px-4 py-2 text-neutral-500">
                      {r.completed_at
                        ? new Date(r.completed_at).toLocaleDateString("es-AR")
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-neutral-500">
                      {r.cost != null ? `$${r.cost.toLocaleString("es-AR")}` : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPreviewRecord(r)}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          👁️
                        </button>
                        <button
                          onClick={() => handleDelete(r)}
                          className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailRecord && (
        <MaintenanceDetailModal
          record={detailRecord}
          vehicles={vehicles}
          personal={personal}
          linkedFinding={findingFor(detailRecord.id)}
          onClose={() => setDetailRecord(null)}
          onSaved={() => {
            setDetailRecord(null);
            load();
          }}
        />
      )}

      {previewRecord && (
        <MaintenancePreviewModal
          record={previewRecord}
          vehicleName={vehicleName(previewRecord.vehicle_id)}
          onClose={() => setPreviewRecord(null)}
        />
      )}
    </div>
  );
}

export default function MantenimientoPage() {
  return (
    <ProtectedRoute section="mantenimiento">
      <AppShell>
        <MantenimientoContent />
      </AppShell>
    </ProtectedRoute>
  );
}
