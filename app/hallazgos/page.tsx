"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import type { FindingPriority, MaintenanceFinding, Vehicle } from "@/lib/types";
import { FINDING_PRIORITY_LABELS, FINDING_STATUS_LABELS } from "@/lib/types";

const PRIORITY_COLORS: Record<FindingPriority, string> = {
  baja: "bg-neutral-100 text-neutral-600",
  media: "bg-amber-50 text-amber-700",
  alta: "bg-orange-50 text-orange-700",
  critica: "bg-red-50 text-red-700",
};

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

function HallazgosContent() {
  const { profile } = useAuth();
  const isStaff = profile?.role === "admin" || profile?.role === "guardia";

  const [findings, setFindings] = useState<MaintenanceFinding[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [reporterNames, setReporterNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [area, setArea] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<FindingPriority>("media");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: f } = await supabase
      .from("maintenance_findings")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: v } = await supabase.from("vehicles").select("*").order("name");
    const { data: profiles } = await supabase.from("profiles").select("id, full_name");

    setFindings((f as MaintenanceFinding[]) ?? []);
    setVehicles((v as Vehicle[]) ?? []);
    setReporterNames(
      new Map(((profiles as { id: string; full_name: string }[]) ?? []).map((p) => [p.id, p.full_name]))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("hallazgos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_findings" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const vehicleName = (id: string | null) =>
    id ? vehicles.find((v) => v.id === id)?.name ?? "—" : "—";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !profile) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    let photoUrl: string | null = null;

    if (photoFile) {
      const path = `${profile.organization_id}/${Date.now()}-${photoFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("maintenance-findings")
        .upload(path, photoFile);

      if (uploadError) {
        setError("No se pudo subir la foto: " + uploadError.message);
        setSubmitting(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("maintenance-findings")
        .getPublicUrl(path);
      photoUrl = publicUrlData.publicUrl;
    }

    const { error: insertError } = await supabase.from("maintenance_findings").insert({
      organization_id: profile.organization_id,
      vehicle_id: vehicleId || null,
      area: area || null,
      description: description.trim(),
      priority,
      photo_url: photoUrl,
      reported_by: profile.id,
    });

    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setVehicleId("");
    setArea("");
    setDescription("");
    setPriority("media");
    setPhotoFile(null);
    setShowForm(false);
    setSuccess("Hallazgo reportado. Se generó automáticamente una orden en Mantenimiento.");
    load();
  };

  const handleDelete = async (finding: MaintenanceFinding) => {
    if (!window.confirm("¿Eliminar este hallazgo? La orden de mantenimiento que generó no se borra.")) {
      return;
    }
    const { error: deleteError } = await supabase
      .from("maintenance_findings")
      .delete()
      .eq("id", finding.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Hallazgos de mantenimiento</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Reportar problema
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
        >
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Unidad / equipo (opcional)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Área afectada (opcional)</option>
            {AREA_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción del problema"
            required
            rows={2}
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as FindingPriority)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            {(Object.keys(FINDING_PRIORITY_LABELS) as FindingPriority[]).map((p) => (
              <option key={p} value={p}>
                {FINDING_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60 sm:col-span-2"
          >
            {submitting ? "Enviando…" : "Reportar hallazgo"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-neutral-500">Cargando…</p>
        ) : findings.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
            No hay hallazgos reportados todavía.
          </p>
        ) : (
          findings.map((f) => (
            <div key={f.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm text-neutral-800">{f.description}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {vehicleName(f.vehicle_id)}
                    {f.area ? ` · ${f.area}` : ""}
                    {" · Informado por "}
                    {reporterNames.get(f.reported_by) ?? "—"}
                    {" · "}
                    {new Date(f.created_at).toLocaleString("es-AR")}
                  </p>
                  {f.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.photo_url}
                      alt="Foto del hallazgo"
                      className="mt-2 h-32 w-32 rounded-md object-cover"
                    />
                  )}
                  <p className="mt-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        f.status === "convertido"
                          ? "bg-brand-light text-brand-dark"
                          : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {FINDING_STATUS_LABELS[f.status]}
                    </span>
                    {f.status === "convertido" && (
                      <Link
                        href="/mantenimiento"
                        className="ml-2 font-medium text-brand hover:underline"
                      >
                        Ver en Mantenimiento →
                      </Link>
                    )}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${PRIORITY_COLORS[f.priority]}`}
                >
                  {FINDING_PRIORITY_LABELS[f.priority]}
                </span>
              </div>
              {isStaff && (
                <button
                  onClick={() => handleDelete(f)}
                  className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Eliminar hallazgo
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function HallazgosPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <HallazgosContent />
      </AppShell>
    </ProtectedRoute>
  );
}
