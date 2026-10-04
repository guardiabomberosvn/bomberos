"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { notifyMaintenanceContacts } from "@/lib/maintenance";
import { exportToExcel, exportToPdf } from "@/lib/export";
import type {
  FindingPriority,
  GuardShift,
  MaintenanceFinding,
  MaintenanceStatus,
  Vehicle,
} from "@/lib/types";
import { FINDING_PRIORITY_LABELS, MAINTENANCE_STATUS_LABELS } from "@/lib/types";

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

  const [findings, setFindings] = useState<MaintenanceFinding[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [reporterNames, setReporterNames] = useState<Map<string, string>>(new Map());
  // Estado de la orden de mantenimiento vinculada a cada hallazgo convertido
  // — así se sabe si Mantenimiento ya "tocó" el tema (status !== "pendiente")
  // o todavía no hizo nada con eso.
  const [recordStatusById, setRecordStatusById] = useState<Map<string, MaintenanceStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Historial de hallazgos (todos, sin importar el estado): sirve para que
  // un guardia revise si algo parecido ya se reportó antes, y se puede
  // filtrar por unidad, fecha o palabra clave y exportar.
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyVehicleId, setHistoryVehicleId] = useState("all");
  const [historyKeyword, setHistoryKeyword] = useState("");
  const [findingHistory, setFindingHistory] = useState<MaintenanceFinding[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [area, setArea] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<FindingPriority>("media");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Un guardia tiene que haber abierto turno en el Libro de Guardia antes de
  // poder reportar un hallazgo — admin y jefatura no dependen de esto.
  const [openShift, setOpenShift] = useState<GuardShift | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const isGuardiaRole = profile?.role === "guardia";
  const blockedByShift = isGuardiaRole && !openShift;

  useEffect(() => {
    const loadShift = async () => {
      setShiftLoading(true);
      const { data } = await supabase
        .from("guard_shifts")
        .select("*")
        .is("closed_at", null)
        .maybeSingle();
      setOpenShift((data as GuardShift) ?? null);
      setShiftLoading(false);
    };
    loadShift();
    const shiftChannel = supabase
      .channel("hallazgos-shift")
      .on("postgres_changes", { event: "*", schema: "public", table: "guard_shifts" }, () => loadShift())
      .subscribe();
    return () => {
      supabase.removeChannel(shiftChannel);
    };
  }, []);

  const load = async () => {
    setLoading(true);
    const { data: f } = await supabase
      .from("maintenance_findings")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: v } = await supabase.from("vehicles").select("*").order("name");
    const { data: profiles } = await supabase.from("profiles").select("id, full_name");
    const { data: recs } = await supabase.from("maintenance_records").select("id, status");

    setFindings((f as MaintenanceFinding[]) ?? []);
    setVehicles((v as Vehicle[]) ?? []);
    setReporterNames(
      new Map(((profiles as { id: string; full_name: string }[]) ?? []).map((p) => [p.id, p.full_name]))
    );
    setRecordStatusById(
      new Map(
        ((recs as { id: string; status: MaintenanceStatus }[]) ?? []).map((r) => [r.id, r.status])
      )
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("hallazgos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_findings" }, () => {
        load();
        loadHistory();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_records" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vehicleName = (id: string | null) =>
    id ? vehicles.find((v) => v.id === id)?.name ?? "—" : "—";

  // Un hallazgo convertido en orden de mantenimiento sigue "pendiente" acá
  // (se ve y se puede volver a reportar) hasta que Mantenimiento realmente
  // lo toque — es decir, hasta que la orden vinculada deje de estar en
  // "pendiente". Recién ahí desaparece de esta lista y queda solo en el
  // historial de abajo.
  const isActiveFinding = (f: MaintenanceFinding) => {
    if (f.status === "descartado") return false;
    if (f.status === "pendiente") return true;
    const recordStatus = f.converted_maintenance_id
      ? recordStatusById.get(f.converted_maintenance_id)
      : undefined;
    return recordStatus === undefined || recordStatus === "pendiente";
  };
  const activeFindings = findings.filter(isActiveFinding);

  const findingDisplayStatus = (f: MaintenanceFinding): string => {
    if (f.status === "pendiente") return "Pendiente";
    if (f.status === "descartado") return "Descartado";
    const recordStatus = f.converted_maintenance_id
      ? recordStatusById.get(f.converted_maintenance_id)
      : undefined;
    return recordStatus
      ? `Mantenimiento: ${MAINTENANCE_STATUS_LABELS[recordStatus]}`
      : "Convertido a orden";
  };

  const hasHistoryFilter =
    !!historyFrom || !!historyTo || historyVehicleId !== "all" || !!historyKeyword.trim();

  const buildHistoryQuery = () => {
    let query = supabase
      .from("maintenance_findings")
      .select("*")
      .order("created_at", { ascending: false });
    if (historyVehicleId !== "all") query = query.eq("vehicle_id", historyVehicleId);
    if (historyFrom) query = query.gte("created_at", new Date(historyFrom).toISOString());
    if (historyTo) {
      const to = new Date(historyTo);
      to.setHours(23, 59, 59, 999);
      query = query.lte("created_at", to.toISOString());
    }
    const kw = historyKeyword.trim().replace(/[%,]/g, "");
    if (kw) query = query.or(`description.ilike.%${kw}%,area.ilike.%${kw}%`);
    return query;
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    let query = buildHistoryQuery();
    if (!hasHistoryFilter) query = query.limit(20);
    const { data, error: fetchError } = await query;
    setHistoryLoading(false);
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    setFindingHistory((data as MaintenanceFinding[]) ?? []);
  };

  // Para exportar: la misma búsqueda de loadHistory pero sin el límite de
  // 20, así "Exportar" siempre trae todo lo que cae dentro del filtro
  // actual (o el historial completo si no hay ningún filtro puesto).
  const fetchFullHistory = async (): Promise<MaintenanceFinding[] | null> => {
    const { data, error: fetchError } = await buildHistoryQuery();
    if (fetchError) {
      setError(fetchError.message);
      return null;
    }
    return (data as MaintenanceFinding[]) ?? [];
  };

  useEffect(() => {
    const t = setTimeout(() => {
      loadHistory();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFrom, historyTo, historyVehicleId, historyKeyword]);

  const findingToRow = (f: MaintenanceFinding) => ({
    Fecha: new Date(f.created_at).toLocaleString("es-AR"),
    Unidad: vehicleName(f.vehicle_id),
    Área: f.area ?? "",
    Descripción: f.description,
    Prioridad: FINDING_PRIORITY_LABELS[f.priority],
    Estado: findingDisplayStatus(f),
    "Informado por": reporterNames.get(f.reported_by) ?? "—",
  });

  const filterDescription = () => {
    const parts: string[] = [];
    if (historyVehicleId !== "all") {
      const v = vehicles.find((vv) => vv.id === historyVehicleId);
      if (v) parts.push(`Unidad: ${v.name}`);
    }
    if (historyKeyword.trim()) parts.push(`Búsqueda: "${historyKeyword.trim()}"`);
    if (historyFrom) parts.push(`Desde: ${new Date(historyFrom).toLocaleDateString("es-AR")}`);
    if (historyTo) parts.push(`Hasta: ${new Date(historyTo).toLocaleDateString("es-AR")}`);
    return parts.length > 0 ? parts.join(" · ") : "Historial completo";
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    const rows = await fetchFullHistory();
    setExportingExcel(false);
    if (!rows) return;
    exportToExcel(rows.map(findingToRow), "hallazgos-mantenimiento", "Hallazgos");
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    const rows = await fetchFullHistory();
    setExportingPdf(false);
    if (!rows) return;
    exportToPdf(rows.map(findingToRow), "hallazgos-mantenimiento", {
      title: "Hallazgos de mantenimiento",
      subtitle: filterDescription(),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !profile || blockedByShift) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    let photoUrl: string | null = null;

    if (photoFile) {
      // Las fotos se suben a la carpeta de Google Drive del cuartel (en vez
      // de guardarse en el servidor), para no ocupar el espacio gratuito
      // limitado de Supabase.
      const uploadForm = new FormData();
      uploadForm.append("file", photoFile);
      try {
        // La ruta exige sesión iniciada — se manda el token que ya tiene
        // guardado el cliente de Supabase.
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
          setSubmitting(false);
          return;
        }
        photoUrl = uploadData.url;
      } catch (e) {
        setError(
          "No se pudo subir la foto: " + (e instanceof Error ? e.message : "Error de red")
        );
        setSubmitting(false);
        return;
      }
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

    // Aviso por Telegram a quienes el admin configuró para recibir alertas
    // de mantenimiento (no bloqueamos el formulario esperando esto).
    notifyMaintenanceContacts(
      profile.organization_id,
      `🚧 <b>Nuevo hallazgo reportado</b>\n` +
        `${vehicleName(vehicleId || null)}${area ? " · " + area : ""}\n` +
        `${description.trim()}\n` +
        `Prioridad: ${FINDING_PRIORITY_LABELS[priority]}\n` +
        `Informado por: ${profile.full_name}`
    );

    setVehicleId("");
    setArea("");
    setDescription("");
    setPriority("media");
    setPhotoFile(null);
    setShowForm(false);
    setSuccess("Hallazgo reportado. Se generó automáticamente una orden en Mantenimiento.");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Hallazgos de mantenimiento</h1>
        {!shiftLoading && !blockedByShift && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
          >
            + Reportar problema
          </button>
        )}
      </div>

      {blockedByShift && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Tenés que abrir turno en el Libro de Guardia antes de poder reportar un
          hallazgo.{" "}
          <Link href="/libro-guardia" className="font-medium underline">
            Ir a Libro de Guardia
          </Link>
        </div>
      )}

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

      {showForm && !blockedByShift && (
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

      <div>
        <p className="mb-2 text-sm font-semibold text-neutral-700">Pendientes</p>
        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-neutral-500">Cargando…</p>
          ) : activeFindings.length === 0 ? (
            <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
              No hay hallazgos pendientes. Lo que Mantenimiento ya tomó para trabajar se
              ve y se edita desde esa sección (acá queda en el historial de abajo).
            </p>
          ) : (
            activeFindings.map((f) => (
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
                      <a
                        href={f.photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                      >
                        📷 Ver foto
                      </a>
                    )}
                    <p className="mt-2 text-xs">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-500">
                        {findingDisplayStatus(f)}
                      </span>
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${PRIORITY_COLORS[f.priority]}`}
                  >
                    {FINDING_PRIORITY_LABELS[f.priority]}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-neutral-700">Historial de hallazgos</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleExportExcel}
                disabled={exportingExcel}
                className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
              >
                {exportingExcel ? "Exportando…" : "📥 Excel"}
              </button>
              <button
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
              >
                {exportingPdf ? "Exportando…" : "📄 PDF"}
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_1fr_auto_auto_auto] sm:items-end">
            <label className="block text-xs">
              <span className="mb-1 flex items-center gap-1 font-medium text-neutral-500">
                🔍 Buscar
              </span>
              <input
                type="text"
                value={historyKeyword}
                onChange={(e) => setHistoryKeyword(e.target.value)}
                placeholder="Palabra clave…"
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-neutral-500">Unidad</span>
              <select
                value={historyVehicleId}
                onChange={(e) => setHistoryVehicleId(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="all">Todas</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-neutral-500">Desde</span>
              <input
                type="date"
                value={historyFrom}
                onChange={(e) => setHistoryFrom(e.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-neutral-500">Hasta</span>
              <input
                type="date"
                value={historyTo}
                onChange={(e) => setHistoryTo(e.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </label>
            {hasHistoryFilter && (
              <button
                type="button"
                onClick={() => {
                  setHistoryFrom("");
                  setHistoryTo("");
                  setHistoryVehicleId("all");
                  setHistoryKeyword("");
                }}
                className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {historyLoading ? (
          <p className="px-4 py-4 text-sm text-neutral-500">Cargando…</p>
        ) : findingHistory.length === 0 ? (
          <p className="px-4 py-4 text-sm text-neutral-500">
            {hasHistoryFilter
              ? "No se encontró ningún hallazgo con ese filtro."
              : "Todavía no hay hallazgos reportados."}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {findingHistory.map((f) => (
              <li key={f.id} className="px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-neutral-800">{f.description}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {vehicleName(f.vehicle_id)}
                      {f.area ? ` · ${f.area}` : ""}
                      {" · "}
                      {reporterNames.get(f.reported_by) ?? "—"}
                      {" · "}
                      {new Date(f.created_at).toLocaleString("es-AR")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${PRIORITY_COLORS[f.priority]}`}
                    >
                      {FINDING_PRIORITY_LABELS[f.priority]}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                      {findingDisplayStatus(f)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function HallazgosPage() {
  return (
    <ProtectedRoute section="hallazgos">
      <AppShell>
        <HallazgosContent />
      </AppShell>
    </ProtectedRoute>
  );
}
