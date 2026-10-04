"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { EditVehicleModal } from "@/components/EditVehicleModal";
import { MaintenanceDetailModal } from "@/components/MaintenanceDetailModal";
import { MaintenancePreviewModal } from "@/components/MaintenancePreviewModal";
import { supabase } from "@/lib/supabase";
import { exportMultiSheetExcel } from "@/lib/export";
import { getVehicleServiceAlertLevel } from "@/lib/maintenance";
import type {
  FuelLoad,
  GuardShift,
  MaintenanceFinding,
  MaintenanceRecord,
  Profile,
  Vehicle,
  VehicleMovement,
  VehicleStatus,
} from "@/lib/types";
import {
  MAINTENANCE_ALERT_LABELS,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
} from "@/lib/types";

const SERVICE_ALERT_COLORS: Record<string, string> = {
  en_termino: "bg-emerald-50 text-emerald-700",
  proximo: "bg-amber-50 text-amber-700",
  muy_proximo: "bg-orange-50 text-orange-700",
  vencido: "bg-red-50 text-red-700",
};

const STATUS_COLORS: Record<VehicleStatus, string> = {
  disponible: "bg-emerald-50 text-emerald-700",
  servicio: "bg-brand-light text-brand-dark",
  mantenimiento: "bg-amber-50 text-amber-700",
  fuera_de_servicio: "bg-neutral-100 text-neutral-500",
};

interface HistoryEntry {
  date: string;
  icon: string;
  label: string;
  detail?: string;
  // Solo para entradas de mantenimiento: permite abrir el detalle al tocarlas.
  recordId?: string;
}

function FlotaContent() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [movements, setMovements] = useState<VehicleMovement[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [fuelLoads, setFuelLoads] = useState<FuelLoad[]>([]);
  const [findings, setFindings] = useState<MaintenanceFinding[]>([]);
  const [personal, setPersonal] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [detailRecord, setDetailRecord] = useState<MaintenanceRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<MaintenanceRecord | null>(null);
  const [maintenanceSearch, setMaintenanceSearch] = useState("");
  // Por defecto el gastado se cuenta desde el 1° de enero del año en curso
  // (así en enero vuelve solo a $0 y arranca de nuevo), pero se puede
  // ampliar a cualquier rango con los campos "Desde"/"Hasta".
  const defaultCostFrom = () => `${new Date().getFullYear()}-01-01`;
  const [costFrom, setCostFrom] = useState(defaultCostFrom);
  const [costTo, setCostTo] = useState("");

  // Un guardia tiene que haber abierto turno en el Libro de Guardia para
  // poder guardar cambios en el detalle de una orden de mantenimiento desde
  // acá (el resto de las acciones de Flota ya son solo para admin). Admin y
  // jefatura no dependen de esto.
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
      .channel("flota-shift")
      .on("postgres_changes", { event: "*", schema: "public", table: "guard_shifts" }, () => loadShift())
      .subscribe();
    return () => {
      supabase.removeChannel(shiftChannel);
    };
  }, []);

  const load = async () => {
    setLoading(true);
    const { data: v } = await supabase.from("vehicles").select("*").order("name");
    const { data: m } = await supabase
      .from("vehicle_movements")
      .select("*")
      .order("departed_at", { ascending: false })
      .limit(300);
    const { data: mt } = await supabase
      .from("maintenance_records")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: f } = await supabase
      .from("fuel_loads")
      .select("*")
      .order("loaded_at", { ascending: false });
    const { data: fd } = await supabase
      .from("maintenance_findings")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: p } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .order("full_name");

    setVehicles((v as Vehicle[]) ?? []);
    setMovements((m as VehicleMovement[]) ?? []);
    setMaintenance((mt as MaintenanceRecord[]) ?? []);
    setFuelLoads((f as FuelLoad[]) ?? []);
    setFindings((fd as MaintenanceFinding[]) ?? []);
    setPersonal((p as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !profile) return;
    setError(null);

    const { error: insertError } = await supabase.from("vehicles").insert({
      organization_id: profile.organization_id,
      name: name.trim(),
      type: type.trim() || null,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setName("");
    setType("");
    load();
  };

  const handleStatusChange = async (v: Vehicle, status: VehicleStatus) => {
    const { error: updateError } = await supabase
      .from("vehicles")
      .update({ status })
      .eq("id", v.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleKmChange = async (v: Vehicle, km: string) => {
    const value = Number(km);
    if (Number.isNaN(value)) return;
    const { error: updateError } = await supabase
      .from("vehicles")
      .update({ km: value })
      .eq("id", v.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleToggleActive = async (v: Vehicle) => {
    const { error: updateError } = await supabase
      .from("vehicles")
      .update({ is_active: !v.is_active })
      .eq("id", v.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleDeleteVehicle = async (v: Vehicle) => {
    if (
      !window.confirm(
        `¿Eliminar "${v.name}"? Esto también borra su historial de movimientos, mantenimiento, combustible y hallazgos vinculados. No se puede deshacer.`
      )
    ) {
      return;
    }
    const { error: deleteError } = await supabase.from("vehicles").delete().eq("id", v.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const buildHistory = (vehicleId: string): HistoryEntry[] => {
    const entries: HistoryEntry[] = [];

    movements
      .filter((m) => m.vehicle_id === vehicleId)
      .forEach((m) => {
        entries.push({
          date: m.departed_at,
          icon: "🚚",
          label: "Movimiento",
          detail: m.returned_at
            ? `Regresó ${new Date(m.returned_at).toLocaleString("es-AR")}`
            : "En curso",
        });
      });

    maintenance
      .filter((mt) => mt.vehicle_id === vehicleId)
      .forEach((mt) => {
        entries.push({
          date: mt.created_at,
          icon: "🔧",
          label: `Mantenimiento: ${mt.work}`,
          detail: mt.status,
          recordId: mt.id,
        });
      });

    fuelLoads
      .filter((f) => f.vehicle_id === vehicleId)
      .forEach((f) => {
        entries.push({
          date: f.loaded_at,
          icon: "⛽",
          label: `Carga de combustible: ${f.liters} L`,
          detail: f.cost != null ? `$${f.cost}` : undefined,
        });
      });

    findings
      .filter((f) => f.vehicle_id === vehicleId)
      .forEach((f) => {
        entries.push({
          date: f.created_at,
          icon: "🚧",
          label: `Hallazgo: ${f.description}`,
          detail: f.priority,
        });
      });

    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const findingFor = (recordId: string) =>
    findings.find((f) => f.converted_maintenance_id === recordId) ?? null;

  // Una orden ya completada se abre en modo "solo ver" (no tiene sentido
  // seguir editándola) — solo las que siguen pendientes/en proceso abren
  // en modo edición.
  const openRecord = (record: MaintenanceRecord) => {
    if (record.status === "completado") {
      setPreviewRecord(record);
    } else {
      setDetailRecord(record);
    }
  };

  // Historial de reparaciones de la unidad, con buscador por palabra clave
  // (ej: "frenos", "cubiertas", "service") y por rango de fechas (desde/
  // hasta) — por defecto el rango arranca el 1° de enero del año en curso,
  // así el total de abajo cuenta solo lo del año actual y no todo lo
  // histórico, pero se puede ampliar o acotar a mano.
  const buildMaintenanceHistory = (vehicleId: string) => {
    let vehicleMaintenance = maintenance
      .filter((m) => m.vehicle_id === vehicleId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (costFrom) {
      const from = new Date(costFrom + "T00:00:00").getTime();
      vehicleMaintenance = vehicleMaintenance.filter(
        (m) => new Date(m.created_at).getTime() >= from
      );
    }
    if (costTo) {
      const to = new Date(costTo + "T23:59:59").getTime();
      vehicleMaintenance = vehicleMaintenance.filter(
        (m) => new Date(m.created_at).getTime() <= to
      );
    }

    const query = maintenanceSearch.trim().toLowerCase();
    if (!query) return vehicleMaintenance;

    return vehicleMaintenance.filter((m) =>
      [m.work, MAINTENANCE_TYPE_LABELS[m.type], m.provider, m.performed_by, m.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  };

  // Exporta a Excel los datos generales de la unidad (los mismos que se ven
  // en su tarjeta) + su historial de mantenimiento, respetando el mismo
  // rango de fechas (desde/hasta) y búsqueda que ya están elegidos arriba
  // para esa unidad — así lo que se exporta es exactamente lo que se está
  // mirando en pantalla, no siempre todo el histórico.
  const handleExportVehicle = (v: Vehicle) => {
    const history = buildMaintenanceHistory(v.id);
    const periodLabel =
      costFrom || costTo ? `${costFrom || "inicio"}_a_${costTo || "hoy"}` : "historial_completo";

    exportMultiSheetExcel(
      [
        {
          name: "Datos de la unidad",
          rows: [
            {
              Nombre: v.name,
              Tipo: v.type ?? "",
              Estado: VEHICLE_STATUS_LABELS[v.status],
              Marca: v.brand ?? "",
              Modelo: v.model ?? "",
              Patente: v.license_plate ?? "",
              "Número de chasis": v.chassis_number ?? "",
              "Número de motor": v.engine_number ?? "",
              Kilometraje: v.km,
              "Capacidad (litros)": v.tank_liters ?? "",
              "Próximo service - fecha": v.next_service_date ?? "",
              "Próximo service - km": v.next_service_km ?? "",
              "Próximo service - tipo": v.next_service_type
                ? MAINTENANCE_TYPE_LABELS[v.next_service_type]
                : "",
              "Próximo service - notas": v.next_service_notes ?? "",
              Activa: v.is_active ? "Sí" : "No",
            },
          ],
        },
        {
          name: "Mantenimiento",
          rows: history.map((m) => ({
            Tipo: MAINTENANCE_TYPE_LABELS[m.type],
            Trabajo: m.work,
            Estado: MAINTENANCE_STATUS_LABELS[m.status],
            "Km al reparar": m.repair_km ?? "",
            Precio: m.cost ?? "",
            "Proveedor / taller": m.provider ?? "",
            "Quién lo reparó": m.performed_by ?? "",
            "Personal encargado": m.responsible ?? "",
            Creado: new Date(m.created_at).toLocaleDateString("es-AR"),
            Completado: m.completed_at ? new Date(m.completed_at).toLocaleDateString("es-AR") : "",
            Notas: m.notes ?? "",
          })),
        },
      ],
      `${v.name}_${periodLabel}`.replace(/\s+/g, "_")
    );
  };

  // Resumen rápido del vehículo: todo lo que hoy está repartido entre
  // Combustible, Mantenimiento y Movimientos, nucleado en un solo lugar.
  const buildSummary = (vehicleId: string) => {
    const vehicleFuel = fuelLoads.filter((f) => f.vehicle_id === vehicleId);
    const vehicleMaintenance = maintenance.filter((m) => m.vehicle_id === vehicleId);
    const vehicleMovements = movements.filter((m) => m.vehicle_id === vehicleId);
    const vehicleFindings = findings.filter((f) => f.vehicle_id === vehicleId);

    return {
      fuelLiters: vehicleFuel.reduce((sum, f) => sum + f.liters, 0),
      fuelCost: vehicleFuel.reduce((sum, f) => sum + (f.cost ?? 0), 0),
      fuelCount: vehicleFuel.length,
      movementsCount: vehicleMovements.length,
      maintenancePending: vehicleMaintenance.filter((m) => m.status !== "completado").length,
      maintenanceDone: vehicleMaintenance.filter((m) => m.status === "completado").length,
      findingsPending: vehicleFindings.filter((f) => f.status === "pendiente").length,
    };
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">Flota</h1>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {isAdmin && (
        <form
          onSubmit={handleCreate}
          className="flex flex-wrap gap-2 rounded-xl border border-neutral-200 bg-white p-4"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre, ej: Móvil 1"
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="Tipo (opcional)"
            className="w-40 rounded-md border border-neutral-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            + Agregar unidad
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : vehicles.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
          Todavía no hay vehículos cargados.
        </p>
      ) : (
        <div className="space-y-3">
          {vehicles.map((v) => {
            const isExpanded = expanded === v.id;
            const history = isExpanded ? buildHistory(v.id) : [];
            const summary = isExpanded ? buildSummary(v.id) : null;
            return (
              <div key={v.id} className="rounded-xl border border-neutral-200 bg-white">
                <button
                  onClick={() => {
                    setExpanded(isExpanded ? null : v.id);
                    setMaintenanceSearch("");
                    setCostFrom(defaultCostFrom());
                    setCostTo("");
                  }}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <p className="font-semibold text-neutral-800">{v.name}</p>
                    <p className="text-xs text-neutral-500">
                      {v.type ?? "Sin tipo"} · {v.km.toLocaleString("es-AR")} km
                      {v.license_plate ? ` · ${v.license_plate}` : ""}
                      {!v.is_active && " · Inactivo"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_COLORS[v.status]}`}
                  >
                    {VEHICLE_STATUS_LABELS[v.status]}
                  </span>
                </button>

                {isExpanded && (
                  <div className="space-y-3 border-t border-neutral-100 px-4 py-3">
                    {isAdmin && (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <label className="flex items-center gap-2">
                          <span className="text-neutral-600">Estado:</span>
                          <select
                            value={v.status}
                            onChange={(e) =>
                              handleStatusChange(v, e.target.value as VehicleStatus)
                            }
                            className="rounded-md border border-neutral-300 px-2 py-1"
                          >
                            {(Object.keys(VEHICLE_STATUS_LABELS) as VehicleStatus[]).map(
                              (s) => (
                                <option key={s} value={s}>
                                  {VEHICLE_STATUS_LABELS[s]}
                                </option>
                              )
                            )}
                          </select>
                        </label>
                        <label className="flex items-center gap-2">
                          <span className="text-neutral-600">Km:</span>
                          <input
                            type="number"
                            defaultValue={v.km}
                            onBlur={(e) => handleKmChange(v, e.target.value)}
                            className="w-28 rounded-md border border-neutral-300 px-2 py-1"
                          />
                        </label>
                        <button
                          onClick={() => handleToggleActive(v)}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          {v.is_active ? "Desactivar" : "Activar"}
                        </button>
                        <Link
                          href={`/mantenimiento?vehicle=${v.id}`}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          🔧 Nueva orden
                        </Link>
                        <button
                          onClick={() => setEditingVehicle(v)}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          ✏️ Editar datos
                        </button>
                        <button
                          onClick={() => handleDeleteVehicle(v)}
                          className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}

                    {(v.brand || v.model || v.chassis_number || v.engine_number || v.tank_liters != null) && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-neutral-50 p-3 text-xs sm:grid-cols-3">
                        {(v.brand || v.model) && (
                          <div>
                            <p className="text-neutral-500">Marca / Modelo</p>
                            <p className="font-medium text-neutral-800">
                              {[v.brand, v.model].filter(Boolean).join(" ") || "—"}
                            </p>
                          </div>
                        )}
                        {v.chassis_number && (
                          <div>
                            <p className="text-neutral-500">N° de chasis</p>
                            <p className="font-medium text-neutral-800">{v.chassis_number}</p>
                          </div>
                        )}
                        {v.engine_number && (
                          <div>
                            <p className="text-neutral-500">N° de motor</p>
                            <p className="font-medium text-neutral-800">{v.engine_number}</p>
                          </div>
                        )}
                        {v.tank_liters != null && (
                          <div>
                            <p className="text-neutral-500">Litros (capacidad)</p>
                            <p className="font-medium text-neutral-800">
                              {v.tank_liters.toLocaleString("es-AR")} L
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {(v.next_service_date || v.next_service_km != null) && (
                      <div className="rounded-lg border border-neutral-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                            🔧 Próximo service
                          </p>
                          {(() => {
                            const level = getVehicleServiceAlertLevel(v);
                            return level ? (
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${SERVICE_ALERT_COLORS[level]}`}
                              >
                                {MAINTENANCE_ALERT_LABELS[level]}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <p className="mt-1 text-sm text-neutral-700">
                          {[
                            v.next_service_date ? `Fecha: ${v.next_service_date}` : null,
                            v.next_service_km != null
                              ? `Km: ${v.next_service_km.toLocaleString("es-AR")}`
                              : null,
                            v.next_service_type ? MAINTENANCE_TYPE_LABELS[v.next_service_type] : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {v.next_service_notes && (
                          <p className="mt-1 text-xs text-neutral-500">{v.next_service_notes}</p>
                        )}
                      </div>
                    )}

                    {summary && (
                      <div className="grid grid-cols-2 gap-2 rounded-lg bg-neutral-50 p-3 sm:grid-cols-4">
                        <div>
                          <p className="text-xs text-neutral-500">Combustible</p>
                          <p className="text-sm font-bold text-neutral-900">
                            {summary.fuelLiters.toLocaleString("es-AR")} L
                          </p>
                          <p className="text-xs text-neutral-500">
                            ${summary.fuelCost.toLocaleString("es-AR")} · {summary.fuelCount} cargas
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500">Salidas</p>
                          <p className="text-sm font-bold text-neutral-900">
                            {summary.movementsCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500">Mantenimiento</p>
                          <p className="text-sm font-bold text-neutral-900">
                            {summary.maintenancePending} pendiente
                            {summary.maintenancePending === 1 ? "" : "s"}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {summary.maintenanceDone} completado{summary.maintenanceDone === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500">Hallazgos</p>
                          <p className="text-sm font-bold text-neutral-900">
                            {summary.findingsPending} pendiente{summary.findingsPending === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-neutral-500">
                        🔧 Reparaciones de mantenimiento
                      </p>
                      <input
                        value={maintenanceSearch}
                        onChange={(e) => setMaintenanceSearch(e.target.value)}
                        placeholder="Buscar por palabra clave, ej: frenos, cubiertas, service"
                        className="mb-2 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                      />
                      <div className="mb-2 grid grid-cols-2 gap-2">
                        <label className="block text-xs text-neutral-500">
                          Desde
                          <input
                            type="date"
                            value={costFrom}
                            onChange={(e) => setCostFrom(e.target.value)}
                            className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                        </label>
                        <label className="block text-xs text-neutral-500">
                          Hasta
                          <input
                            type="date"
                            value={costTo}
                            onChange={(e) => setCostTo(e.target.value)}
                            className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                        </label>
                      </div>
                      <div className="mb-2 flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setCostFrom(defaultCostFrom());
                            setCostTo("");
                          }}
                          className="text-brand hover:underline"
                        >
                          Año actual
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCostFrom("");
                            setCostTo("");
                          }}
                          className="text-neutral-500 hover:underline"
                        >
                          Ver todo el historial
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportVehicle(v)}
                          className="ml-auto font-medium text-brand hover:underline"
                        >
                          📥 Exportar esta unidad
                        </button>
                      </div>
                      {(() => {
                        const results = buildMaintenanceHistory(v.id);
                        const total = results.reduce((sum, m) => sum + (m.cost ?? 0), 0);
                        return (
                          <>
                            <div className="mb-2 flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                              <span className="text-xs text-neutral-500">
                                Gastado en el período
                              </span>
                              <span className="text-sm font-bold text-neutral-900">
                                ${total.toLocaleString("es-AR")}
                              </span>
                            </div>
                            {results.length === 0 ? (
                              <p className="text-sm text-neutral-500">
                                {maintenanceSearch.trim() || costFrom || costTo
                                  ? "Sin resultados para ese filtro."
                                  : "Sin reparaciones registradas todavía."}
                              </p>
                            ) : (
                              <ul className="divide-y divide-neutral-100 text-sm">
                                {results.map((m) => (
                                  <li key={m.id}>
                                    <button
                                      type="button"
                                      onClick={() => openRecord(m)}
                                      className="flex w-full items-start justify-between gap-2 py-1.5 text-left hover:bg-neutral-50"
                                    >
                                      <div>
                                        <p className="text-neutral-800 hover:underline">{m.work}</p>
                                        <p className="text-xs text-neutral-500">
                                          {MAINTENANCE_TYPE_LABELS[m.type]} ·{" "}
                                          {new Date(m.created_at).toLocaleDateString("es-AR")}
                                          {m.provider ? ` · ${m.provider}` : ""}
                                        </p>
                                      </div>
                                      <div className="shrink-0 text-right">
                                        <p className="text-xs text-neutral-500">
                                          {MAINTENANCE_STATUS_LABELS[m.status]}
                                        </p>
                                        {m.cost != null && (
                                          <p className="text-xs font-medium text-neutral-700">
                                            ${m.cost.toLocaleString("es-AR")}
                                          </p>
                                        )}
                                      </div>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-neutral-500">
                        Historial completo
                      </p>
                      {history.length === 0 ? (
                        <p className="text-sm text-neutral-500">
                          Sin actividad registrada todavía.
                        </p>
                      ) : (
                        <ul className="divide-y divide-neutral-100 text-sm">
                          {history.slice(0, 20).map((h, i) => {
                            const record = h.recordId
                              ? maintenance.find((m) => m.id === h.recordId)
                              : undefined;
                            const body = (
                              <>
                                <span>{h.icon}</span>
                                <div>
                                  <p className={`text-neutral-800 ${record ? "hover:underline" : ""}`}>
                                    {h.label}
                                  </p>
                                  <p className="text-xs text-neutral-500">
                                    {new Date(h.date).toLocaleString("es-AR")}
                                    {h.detail ? ` · ${h.detail}` : ""}
                                  </p>
                                </div>
                              </>
                            );
                            return (
                              <li key={i} className="py-1.5">
                                {record ? (
                                  <button
                                    type="button"
                                    onClick={() => openRecord(record)}
                                    className="flex w-full items-start gap-2 text-left"
                                  >
                                    {body}
                                  </button>
                                ) : (
                                  <div className="flex items-start gap-2">{body}</div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingVehicle && (
        <EditVehicleModal
          vehicle={editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onSaved={() => {
            setEditingVehicle(null);
            load();
          }}
        />
      )}

      {detailRecord && (
        <MaintenanceDetailModal
          record={detailRecord}
          vehicles={vehicles}
          personal={personal}
          linkedFinding={findingFor(detailRecord.id)}
          blockedByShift={blockedByShift}
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
          vehicleName={vehicles.find((v) => v.id === previewRecord.vehicle_id)?.name ?? "—"}
          onClose={() => setPreviewRecord(null)}
        />
      )}
    </div>
  );
}

export default function FlotaPage() {
  return (
    <ProtectedRoute section="flota">
      <AppShell>
        <FlotaContent />
      </AppShell>
    </ProtectedRoute>
  );
}
