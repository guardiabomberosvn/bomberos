"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FindingPriority, MaintenanceFinding, Vehicle } from "@/lib/types";
import { FINDING_PRIORITY_LABELS } from "@/lib/types";

const AREA_OPTIONS = [
  "Motor",
  "Frenos",
  "Electricidad",
  "Neumáticos",
  "Carrocería",
  "Bomba",
  "Lubricación",
  "Otro",
];

export function EditFindingModal({
  finding,
  vehicles,
  onClose,
  onSaved,
}: {
  finding: MaintenanceFinding;
  vehicles: Vehicle[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vehicleId, setVehicleId] = useState(finding.vehicle_id ?? "");
  const [area, setArea] = useState(finding.area ?? "");
  const [description, setDescription] = useState(finding.description);
  const [priority, setPriority] = useState<FindingPriority>(finding.priority);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!description.trim()) {
      setError("La descripción no puede estar vacía.");
      return;
    }
    setSaving(true);

    let photoUrl: string | null | undefined = undefined; // undefined = no tocar
    if (removePhoto) photoUrl = null;

    if (photoFile) {
      const uploadForm = new FormData();
      uploadForm.append("file", photoFile);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        const uploadRes = await fetch("/api/upload-hallazgo-photo", {
          method: "POST",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
          body: uploadForm,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          setError("No se pudo subir la foto: " + (uploadData.error ?? "Error desconocido"));
          setSaving(false);
          return;
        }
        photoUrl = uploadData.url;
      } catch (e) {
        setError("No se pudo subir la foto: " + (e instanceof Error ? e.message : "Error de red"));
        setSaving(false);
        return;
      }
    }

    const { error: updateError } = await supabase
      .from("maintenance_findings")
      .update({
        vehicle_id: vehicleId || null,
        area: area || null,
        description: description.trim(),
        priority,
        ...(photoUrl !== undefined ? { photo_url: photoUrl } : {}),
      })
      .eq("id", finding.id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-neutral-900">Editar hallazgo</h2>

        {error && (
          <div className="mb-3 mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Unidad / equipo</span>
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
            <span className="mb-1 block font-medium text-neutral-700">Área afectada</span>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            >
              <option value="">Sin especificar</option>
              {AREA_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Descripción</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Prioridad</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as FindingPriority)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            >
              {(Object.keys(FINDING_PRIORITY_LABELS) as FindingPriority[]).map((p) => (
                <option key={p} value={p}>
                  {FINDING_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>

          {finding.photo_url && !removePhoto && (
            <div className="flex items-center justify-between rounded-md bg-neutral-50 px-3 py-2 text-xs">
              <a
                href={finding.photo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand hover:underline"
              >
                📷 Ver foto actual
              </a>
              <button
                type="button"
                onClick={() => setRemovePhoto(true)}
                className="font-medium text-red-600 hover:underline"
              >
                Quitar foto
              </button>
            </div>
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">
              {finding.photo_url ? "Reemplazar foto" : "Agregar foto"}
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                setPhotoFile(e.target.files?.[0] ?? null);
                if (e.target.files?.[0]) setRemovePhoto(false);
              }}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
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
