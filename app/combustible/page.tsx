"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { exportToExcel } from "@/lib/export";
import type { FuelLoad, Vehicle } from "@/lib/types";

function CombustibleContent() {
  const { profile } = useAuth();
  const [loads, setLoads] = useState<FuelLoad[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [liters, setLiters] = useState("");
  const [km, setKm] = useState("");
  const [cost, setCost] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: f } = await supabase
      .from("fuel_loads")
      .select("*")
      .order("loaded_at", { ascending: false })
      .limit(200);
    const { data: v } = await supabase
      .from("vehicles")
      .select("*")
      .eq("is_active", true)
      .order("name");
    setLoads((f as FuelLoad[]) ?? []);
    setVehicles((v as Vehicle[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? "—";

  const monthSummary = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = loads.filter((l) => new Date(l.loaded_at) >= monthStart);
    return {
      liters: thisMonth.reduce((sum, l) => sum + l.liters, 0),
      cost: thisMonth.reduce((sum, l) => sum + (l.cost ?? 0), 0),
      count: thisMonth.length,
    };
  }, [loads]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId || !liters) return;
    setError(null);
    if (!profile) return;

    const { error: insertError } = await supabase.from("fuel_loads").insert({
      organization_id: profile.organization_id,
      vehicle_id: vehicleId,
      liters: Number(liters),
      km: km ? Number(km) : null,
      cost: cost ? Number(cost) : null,
      registered_by: profile.id,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setVehicleId("");
    setLiters("");
    setKm("");
    setCost("");
    setShowForm(false);
    load();
  };

  const handleDelete = async (l: FuelLoad) => {
    if (!window.confirm("¿Eliminar esta carga de combustible?")) return;
    const { error: deleteError } = await supabase.from("fuel_loads").delete().eq("id", l.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const handleExport = () => {
    exportToExcel(
      loads.map((l) => ({
        Vehículo: vehicleName(l.vehicle_id),
        Fecha: new Date(l.loaded_at).toLocaleString("es-AR"),
        Litros: l.liters,
        Km: l.km ?? "",
        Costo: l.cost ?? "",
      })),
      "combustible",
      "Combustible"
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Combustible</h1>
        <div className="flex gap-2">
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
            + Registrar carga
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Litros este mes</p>
          <p className="text-2xl font-bold text-neutral-900">
            {monthSummary.liters.toLocaleString("es-AR")}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Gasto este mes</p>
          <p className="text-2xl font-bold text-brand">
            ${monthSummary.cost.toLocaleString("es-AR")}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Cargas este mes</p>
          <p className="text-2xl font-bold text-neutral-900">{monthSummary.count}</p>
        </div>
      </div>

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
          <input
            type="number"
            step="0.1"
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            placeholder="Litros"
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            type="number"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="Km (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            type="number"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="Costo (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark sm:col-span-2"
          >
            Guardar carga
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Vehículo</th>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Litros</th>
              <th className="px-4 py-2 font-medium">Km</th>
              <th className="px-4 py-2 font-medium">Costo</th>
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
            ) : loads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Sin cargas registradas.
                </td>
              </tr>
            ) : (
              loads.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 text-neutral-800">{vehicleName(l.vehicle_id)}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {new Date(l.loaded_at).toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{l.liters}</td>
                  <td className="px-4 py-2 text-neutral-600">{l.km ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {l.cost != null ? `$${l.cost}` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleDelete(l)}
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

export default function CombustiblePage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "guardia"]}>
      <AppShell>
        <CombustibleContent />
      </AppShell>
    </ProtectedRoute>
  );
}
