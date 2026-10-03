"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { getVehicleServiceAlertLevel, notifyResponsible } from "@/lib/maintenance";
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
import { MAINTENANCE_ALERT_LABELS, MAINTENANCE_STATUS_LABELS, MAINTENANCE_TYPE_LABELS } from "@/lib/types";

const SERVICE_ALERT_COLORS: Record<string, string> = {
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
  const [cost, setCost] = useState("");
  const [detailRecord, setDetailRecord] = useState<MaintenanceRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<MaintenanceRecord | null>(null);

  // Si venimos desde Flota con "Nueva orden", preseleccionamos el vehículo
  // y abrimos el formulario directo.
  useEffect(() => {
    const preselected = searchParams.get("vehicle");
    if (preselected) {
      setVehicleId(preselected);
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

  const vehicleFor = (id: string | null) => (id ? vehicles.find((v) => v.id === id) : undefined);

  const findingFor = (recordId: string) =>
    findings.find((f) => f.converted_maintenance_id === recordId) ?? null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!work.trim() || !profile) return;
    setError(null);

    const responsiblePerson = personal.find((p) => p.id === responsibleId);
    const costValue = cost.trim() ? Number(cost) : null;
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
          `Revisala en la app, sección Mantenimiento.`
      );
    }

    setVehicleId("");
    setWork("");
    setResponsibleId("");
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

  // Antes esto era un solo total combinado de toda la flota. Ahora se
  // desglosa por unidad para poder comparar cuánto se gastó en cada una.
  const spentByVehicle = (() => {
    const totals = new Map<string, number>();
    for (const r of records) {
      if (!r.cost) continue;
      const key = r.vehicle_id ?? "sin_unidad";
      totals.set(key, (totals.get(key) ?? 0) + r.cost);
    }
    return Array.from(totals.entries())
      .map(([key, total]) => ({
        key,
        name: key === "sin_unidad" ? "Sin unidad asignada" : vehicleName(key),
        total,
      }))
      .sort((a, b) => b.total - a.total);
  })();

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

      {spentByVehicle.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <p className="text-xs text-neutral-500">Gastado en mantenimiento por unidad</p>
          <ul className="mt-2 divide-y divide-neutral-100">
            {spentByVehicle.map((v) => (
              <li key={v.key} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-neutral-700">{v.name}</span>
                <span className="font-semibold text-neutral-900">
                  ${v.total.toLocaleString("es-AR")}
                </span>
              </li>
            ))}
          </ul>
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
          <p className="text-xs text-neutral-400 sm:col-span-2">
            El próximo service programado (por fecha o km) se carga desde Flota, en los
            datos de la unidad — no acá.
          </p>
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
            const vehicle = vehicleFor(r.vehicle_id);
            const serviceLevel = vehicle ? getVehicleServiceAlertLevel(vehicle) : null;
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
                  {serviceLevel && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${SERVICE_ALERT_COLORS[serviceLevel]}`}
                      title="Próximo service programado para esta unidad"
                    >
                      {MAINTENANCE_ALERT_LABELS[serviceLevel]}
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <label className="text-xs">
                    <span className="mb-1 block text-neutral-500">Personal encargado</span>
                    <select
                      value={r.responsible_id ?? ""}
                      onChange={(e) => handleResponsibleChange(r, e.target.value)}
                      className="w-full rounded-md border border-neutral-300 px-2 py-1 sm:w-64"
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
                        onClick={() => setPreviewRecord(r)}
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
          onFindingChanged={() => load()}
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
