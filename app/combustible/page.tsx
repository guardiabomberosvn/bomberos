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
  const [vehicleSearch, setVehicleSearch] = useState("");

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

  // Consumo entre cargas: para cada carga, busca la carga anterior (en el
  // tiempo) del MISMO vehículo que tenga km cargado, y calcula cuántos km se
  // recorrieron y cuántos litros se cargaron ahora para cubrir esa distancia
  // (método "tanque lleno a tanque lleno": los litros de la carga actual son
  // los que se consumieron desde la carga anterior).
  const consumptionByLoad = useMemo(() => {
    const map = new Map<string, { kmDelta: number; kmPerLiter: number; litersPer100km: number }>();
    const byVehicle = new Map<string, FuelLoad[]>();
    loads.forEach((l) => {
      const arr = byVehicle.get(l.vehicle_id) ?? [];
      arr.push(l);
      byVehicle.set(l.vehicle_id, arr);
    });
    byVehicle.forEach((vehicleLoads) => {
      const withKm = [...vehicleLoads]
        .filter((l) => l.km != null)
        .sort((a, b) => new Date(a.loaded_at).getTime() - new Date(b.loaded_at).getTime());
      for (let i = 1; i < withKm.length; i++) {
        const prev = withKm[i - 1];
        const curr = withKm[i];
        const kmDelta = (curr.km as number) - (prev.km as number);
        if (kmDelta > 0 && curr.liters > 0) {
          map.set(curr.id, {
            kmDelta,
            kmPerLiter: kmDelta / curr.liters,
            litersPer100km: (curr.liters / kmDelta) * 100,
          });
        }
      }
    });
    return map;
  }, [loads]);

  const filteredLoads = useMemo(() => {
    const term = vehicleSearch.trim().toLowerCase();
    if (!term) return loads;
    return loads.filter((l) => vehicleName(l.vehicle_id).toLowerCase().includes(term));
  }, [loads, vehicleSearch, vehicles]);

  // Resumen agregado por vehículo para lo que quedó filtrado por la búsqueda
  // (litros totales, costo total, km recorridos y consumo promedio).
  const vehicleSummaries = useMemo(() => {
    if (!vehicleSearch.trim()) return [];
    const byVehicle = new Map<string, FuelLoad[]>();
    filteredLoads.forEach((l) => {
      const arr = byVehicle.get(l.vehicle_id) ?? [];
      arr.push(l);
      byVehicle.set(l.vehicle_id, arr);
    });
    return Array.from(byVehicle.entries()).map(([vId, vLoads]) => {
      const totalLiters = vLoads.reduce((sum, l) => sum + l.liters, 0);
      const totalCost = vLoads.reduce((sum, l) => sum + (l.cost ?? 0), 0);
      const withKm = [...vLoads]
        .filter((l) => l.km != null)
        .sort((a, b) => new Date(a.loaded_at).getTime() - new Date(b.loaded_at).getTime());
      let kmTraveled = 0;
      let litersSinceFirst = 0;
      if (withKm.length >= 2) {
        kmTraveled = (withKm[withKm.length - 1].km as number) - (withKm[0].km as number);
        litersSinceFirst = withKm.slice(1).reduce((sum, l) => sum + l.liters, 0);
      }
      const avgKmPerLiter = kmTraveled > 0 && litersSinceFirst > 0 ? kmTraveled / litersSinceFirst : null;
      const avgLitersPer100km = kmTraveled > 0 && litersSinceFirst > 0 ? (litersSinceFirst / kmTraveled) * 100 : null;
      return {
        vehicleId: vId,
        name: vehicleName(vId),
        totalLiters,
        totalCost,
        count: vLoads.length,
        kmTraveled,
        avgKmPerLiter,
        avgLitersPer100km,
      };
    });
  }, [filteredLoads, vehicleSearch]);

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
      created_by: profile.id,
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
      <div className="flex flex-wrap items-center justify-between gap-2">
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

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">
            Buscar por unidad / vehículo / equipo
          </span>
          <input
            type="text"
            value={vehicleSearch}
            onChange={(e) => setVehicleSearch(e.target.value)}
            placeholder="Ej: Dino…"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 sm:w-80"
          />
        </label>

        {vehicleSearch.trim() && (
          <div className="mt-4 space-y-3">
            {vehicleSummaries.length === 0 ? (
              <p className="text-sm text-neutral-500">No hay cargas para esa búsqueda.</p>
            ) : (
              vehicleSummaries.map((v) => (
                <div key={v.vehicleId} className="rounded-lg bg-neutral-50 p-3">
                  <p className="text-sm font-semibold text-neutral-800">{v.name}</p>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div>
                      <p className="text-xs text-neutral-500">Cargas</p>
                      <p className="text-lg font-bold text-neutral-900">{v.count}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500">Litros totales</p>
                      <p className="text-lg font-bold text-neutral-900">
                        {v.totalLiters.toLocaleString("es-AR")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500">Gasto total</p>
                      <p className="text-lg font-bold text-brand">
                        ${v.totalCost.toLocaleString("es-AR")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500">Km recorridos</p>
                      <p className="text-lg font-bold text-neutral-900">
                        {v.kmTraveled > 0 ? v.kmTraveled.toLocaleString("es-AR") : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500">Consumo promedio</p>
                      <p className="text-lg font-bold text-neutral-900">
                        {v.avgKmPerLiter != null
                          ? `${v.avgKmPerLiter.toFixed(1)} km/L`
                          : "—"}
                      </p>
                      {v.avgLitersPer100km != null && (
                        <p className="text-xs text-neutral-400">
                          {v.avgLitersPer100km.toFixed(1)} L/100km
                        </p>
                      )}
                    </div>
                  </div>
                  {v.kmTraveled === 0 && (
                    <p className="mt-2 text-xs text-neutral-400">
                      Necesitás al menos 2 cargas con km cargado para calcular el consumo.
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
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
              <th className="px-4 py-2 font-medium">Consumo</th>
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
            ) : filteredLoads.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                  Sin cargas registradas.
                </td>
              </tr>
            ) : (
              filteredLoads.map((l) => {
                const consumption = consumptionByLoad.get(l.id);
                return (
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
                    <td className="px-4 py-2 text-neutral-600">
                      {consumption ? (
                        <span title={`${consumption.kmDelta} km desde la carga anterior`}>
                          {consumption.kmPerLiter.toFixed(1)} km/L
                        </span>
                      ) : (
                        "—"
                      )}
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CombustiblePage() {
  return (
    <ProtectedRoute section="combustible">
      <AppShell>
        <CombustibleContent />
      </AppShell>
    </ProtectedRoute>
  );
}
