"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import type {
  FuelLoad,
  MaintenanceFinding,
  MaintenanceRecord,
  Vehicle,
  VehicleMovement,
  VehicleStatus,
} from "@/lib/types";
import { VEHICLE_STATUS_LABELS } from "@/lib/types";

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
}

function FlotaContent() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [movements, setMovements] = useState<VehicleMovement[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [fuelLoads, setFuelLoads] = useState<FuelLoad[]>([]);
  const [findings, setFindings] = useState<MaintenanceFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

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

    setVehicles((v as Vehicle[]) ?? []);
    setMovements((m as VehicleMovement[]) ?? []);
    setMaintenance((mt as MaintenanceRecord[]) ?? []);
    setFuelLoads((f as FuelLoad[]) ?? []);
    setFindings((fd as MaintenanceFinding[]) ?? []);
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
                  onClick={() => setExpanded(isExpanded ? null : v.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <p className="font-semibold text-neutral-800">{v.name}</p>
                    <p className="text-xs text-neutral-500">
                      {v.type ?? "Sin tipo"} · {v.km.toLocaleString("es-AR")} km
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
                          🔧 Programar service
                        </Link>
                        <button
                          onClick={() => handleDeleteVehicle(v)}
                          className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Eliminar
                        </button>
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
                        Historial completo
                      </p>
                      {history.length === 0 ? (
                        <p className="text-sm text-neutral-500">
                          Sin actividad registrada todavía.
                        </p>
                      ) : (
                        <ul className="divide-y divide-neutral-100 text-sm">
                          {history.slice(0, 20).map((h, i) => (
                            <li key={i} className="flex items-start gap-2 py-1.5">
                              <span>{h.icon}</span>
                              <div>
                                <p className="text-neutral-800">{h.label}</p>
                                <p className="text-xs text-neutral-500">
                                  {new Date(h.date).toLocaleString("es-AR")}
                                  {h.detail ? ` · ${h.detail}` : ""}
                                </p>
                              </div>
                            </li>
                          ))}
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
    </div>
  );
}

export default function FlotaPage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "guardia"]}>
      <AppShell>
        <FlotaContent />
      </AppShell>
    </ProtectedRoute>
  );
}
