"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { notifyResponsible } from "@/lib/maintenance";
import { EditFindingModal } from "@/components/EditFindingModal";
import type {
  MaintenanceFinding,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
  Profile,
  Vehicle,
} from "@/lib/types";
import {
  FINDING_PRIORITY_LABELS,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_TYPE_LABELS,
} from "@/lib/types";

// Modal de detalle/edición completa de una orden de mantenimiento: acá se
// edita solo el trabajo en sí (qué se hizo, km, proveedor, quién lo
// reparó, precio) — el próximo service programado es un dato de la unidad
// y se edita desde Flota, no desde acá. Si la orden nació de un hallazgo
// reportado por un bombero, se ve la foto y el detalle de ese hallazgo, y
// desde acá mismo se puede editar o eliminar ese hallazgo (a propósito no
// se puede desde el apartado de Hallazgos, para que todo el mantenimiento
// — incluido lo que generaron los hallazgos — se edite en un solo lugar).
export function MaintenanceDetailModal({
  record,
  vehicles,
  personal,
  linkedFinding,
  onClose,
  onSaved,
  onFindingChanged,
}: {
  record: MaintenanceRecord;
  vehicles: Vehicle[];
  personal: Profile[];
  linkedFinding: MaintenanceFinding | null;
  onClose: () => void;
  onSaved: () => void;
  onFindingChanged: () => void;
}) {
  const [editingFinding, setEditingFinding] = useState(false);
  const [deletingFinding, setDeletingFinding] = useState(false);
  const [vehicleId, setVehicleId] = useState(record.vehicle_id ?? "");
  const [type, setType] = useState<MaintenanceType>(record.type);
  const [work, setWork] = useState(record.work);
  const [responsibleId, setResponsibleId] = useState(record.responsible_id ?? "");
  const [status, setStatus] = useState<MaintenanceStatus>(record.status);
  const [cost, setCost] = useState(record.cost != null ? String(record.cost) : "");
  const [repairKm, setRepairKm] = useState(
    record.repair_km != null ? String(record.repair_km) : ""
  );
  const [provider, setProvider] = useState(record.provider ?? "");
  const [performedBy, setPerformedBy] = useState(record.performed_by ?? "");
  const [notes, setNotes] = useState(record.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toNumberOrNull = (v: string) => (v.trim() ? Number(v) : null);

  const handleSave = async () => {
    setError(null);
    if (!work.trim()) {
      setError("El trabajo no puede estar vacío.");
      return;
    }
    const costValue = toNumberOrNull(cost);
    const repairKmValue = toNumberOrNull(repairKm);
    if (cost.trim() && Number.isNaN(costValue)) {
      setError("El costo tiene que ser un número.");
      return;
    }
    if (repairKm.trim() && Number.isNaN(repairKmValue)) {
      setError("El km de la reparación tiene que ser un número.");
      return;
    }

    setSaving(true);
    const responsiblePerson = personal.find((p) => p.id === responsibleId);
    const responsibleChanged = responsibleId !== (record.responsible_id ?? "");

    const { error: updateError } = await supabase
      .from("maintenance_records")
      .update({
        vehicle_id: vehicleId || null,
        type,
        work: work.trim(),
        responsible_id: responsibleId || null,
        responsible: responsiblePerson?.full_name ?? null,
        status,
        cost: costValue,
        repair_km: repairKmValue,
        provider: provider.trim() || null,
        performed_by: performedBy.trim() || null,
        notes: notes.trim() || null,
        completed_at:
          status === "completado"
            ? record.completed_at ?? new Date().toISOString()
            : null,
      })
      .eq("id", record.id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    if (responsibleChanged && responsiblePerson) {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      notifyResponsible(
        responsiblePerson,
        `🔧 <b>Se te asignó una orden de mantenimiento</b>\n` +
          `${work.trim()}${vehicle ? " — " + vehicle.name : ""}\n` +
          `Revisala en la app, sección Mantenimiento.`
      );
    }

    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-neutral-900">Detalle de la orden</h2>

        {error && (
          <div className="mb-3 mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {linkedFinding && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
              🚧 Generada desde un hallazgo
            </p>
            <p className="text-neutral-700">{linkedFinding.description}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {linkedFinding.area ? `${linkedFinding.area} · ` : ""}
              Prioridad: {FINDING_PRIORITY_LABELS[linkedFinding.priority]}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {linkedFinding.photo_url && (
                <a
                  href={linkedFinding.photo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
                >
                  📷 Ver foto del hallazgo
                </a>
              )}
              <button
                type="button"
                onClick={() => setEditingFinding(true)}
                className="inline-flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
              >
                ✏️ Editar hallazgo
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (
                    !window.confirm(
                      "¿Eliminar este hallazgo? La orden de mantenimiento no se borra, solo se quita la referencia al hallazgo."
                    )
                  )
                    return;
                  setDeletingFinding(true);
                  await supabase.from("maintenance_findings").delete().eq("id", linkedFinding.id);
                  setDeletingFinding(false);
                  onFindingChanged();
                }}
                disabled={deletingFinding}
                className="inline-flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-60"
              >
                {deletingFinding ? "Eliminando…" : "🗑️ Eliminar hallazgo"}
              </button>
            </div>
          </div>
        )}

        {editingFinding && linkedFinding && (
          <EditFindingModal
            finding={linkedFinding}
            vehicles={vehicles}
            onClose={() => setEditingFinding(false)}
            onSaved={() => {
              setEditingFinding(false);
              onFindingChanged();
            }}
          />
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-neutral-700">Trabajo</span>
            <input
              value={work}
              onChange={(e) => setWork(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Vehículo</span>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            >
              <option value="">Sin asignar</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Tipo</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MaintenanceType)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            >
              {(Object.keys(MAINTENANCE_TYPE_LABELS) as MaintenanceType[]).map((t) => (
                <option key={t} value={t}>
                  {MAINTENANCE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Estado</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as MaintenanceStatus)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            >
              {(Object.keys(MAINTENANCE_STATUS_LABELS) as MaintenanceStatus[]).map((s) => (
                <option key={s} value={s}>
                  {MAINTENANCE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Personal encargado</span>
            <select
              value={responsibleId}
              onChange={(e) => setResponsibleId(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            >
              <option value="">Sin asignar</option>
              {personal.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>

          <div className="border-t border-neutral-100 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:col-span-2">
            Datos de la reparación
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Km al reparar</span>
            <input
              type="number"
              value={repairKm}
              onChange={(e) => setRepairKm(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Precio</span>
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="$"
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Proveedor / taller</span>
            <input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Quién lo reparó</span>
            <input
              value={performedBy}
              onChange={(e) => setPerformedBy(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-neutral-700">Notas</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
