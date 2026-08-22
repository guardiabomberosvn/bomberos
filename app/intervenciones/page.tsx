"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { StatsBarChart } from "@/components/StatsBarChart";
import { supabase } from "@/lib/supabase";
import { exportToExcel } from "@/lib/export";
import type {
  IncidentCategory,
  Intervention,
  InterventionUnit,
  Profile,
  Vehicle,
} from "@/lib/types";
import { INCIDENT_CATEGORIES } from "@/lib/types";

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function IntervencionesContent() {
  const { profile } = useAuth();
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [units, setUnits] = useState<InterventionUnit[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [personal, setPersonal] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [incidentCategory, setIncidentCategory] = useState<IncidentCategory | "">("");
  const [callerPhone, setCallerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [barrio, setBarrio] = useState("");
  const [personnelInCharge, setPersonnelInCharge] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [fuelNotes, setFuelNotes] = useState("");
  const [observations, setObservations] = useState("");

  const [addingUnitTo, setAddingUnitTo] = useState<string | null>(null);
  const [unitVehicleId, setUnitVehicleId] = useState("");
  const [unitDriverId, setUnitDriverId] = useState("");

  const [editingUnit, setEditingUnit] = useState<InterventionUnit | null>(null);
  const [editKmOut, setEditKmOut] = useState("");
  const [editKmIn, setEditKmIn] = useState("");
  const [editReturnedAt, setEditReturnedAt] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: i } = await supabase
      .from("interventions")
      .select("*")
      .order("occurred_at", { ascending: false });
    const { data: u } = await supabase.from("intervention_units").select("*");
    const { data: v } = await supabase
      .from("vehicles")
      .select("*")
      .eq("is_active", true)
      .order("name");
    const { data: p } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .order("full_name");

    setInterventions((i as Intervention[]) ?? []);
    setUnits((u as InterventionUnit[]) ?? []);
    setVehicles((v as Vehicle[]) ?? []);
    setPersonal((p as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? "—";
  const personName = (id: string | null) =>
    personal.find((p) => p.id === id)?.full_name ?? "—";

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !profile) return;
    setError(null);

    // Si hay un turno abierto, el parte queda asociado a ese turno.
    const { data: openShift } = await supabase
      .from("guard_shifts")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .is("closed_at", null)
      .maybeSingle();

    const { error: insertError } = await supabase.from("interventions").insert({
      organization_id: profile.organization_id,
      title: title.trim(),
      occurred_at: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
      incident_category: incidentCategory || null,
      caller_phone: callerPhone.trim() || null,
      address: address.trim() || null,
      barrio: barrio || null,
      personnel_in_charge: personnelInCharge.trim() || null,
      operator_id: operatorId || null,
      fuel_notes: fuelNotes.trim() || null,
      observations: observations.trim() || null,
      created_by: profile.id,
      shift_id: openShift?.id ?? null,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setTitle("");
    setOccurredAt("");
    setIncidentCategory("");
    setCallerPhone("");
    setAddress("");
    setBarrio("");
    setPersonnelInCharge("");
    setOperatorId("");
    setFuelNotes("");
    setObservations("");
    setShowForm(false);
    load();
  };

  const handleAddUnit = async (interventionId: string) => {
    if (!unitVehicleId) return;
    const { error: insertError } = await supabase.from("intervention_units").insert({
      intervention_id: interventionId,
      vehicle_id: unitVehicleId,
      driver_id: unitDriverId || null,
      departed_at: new Date().toISOString(),
    });
    if (insertError) setError(insertError.message);
    setUnitVehicleId("");
    setUnitDriverId("");
    setAddingUnitTo(null);
    load();
  };

  const openEditUnit = (u: InterventionUnit) => {
    setEditKmOut(u.km_out != null ? String(u.km_out) : "");
    setEditKmIn(u.km_in != null ? String(u.km_in) : "");
    if (u.returned_at) {
      const d = new Date(u.returned_at);
      const pad = (n: number) => String(n).padStart(2, "0");
      setEditReturnedAt(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      );
    } else {
      setEditReturnedAt("");
    }
    setEditingUnit(u);
  };

  const confirmEditUnit = async () => {
    if (!editingUnit) return;
    const { error: updateError } = await supabase
      .from("intervention_units")
      .update({
        km_out: editKmOut ? Number(editKmOut) : null,
        km_in: editKmIn ? Number(editKmIn) : null,
        returned_at: editReturnedAt ? new Date(editReturnedAt).toISOString() : null,
      })
      .eq("id", editingUnit.id);
    if (updateError) setError(updateError.message);
    setEditingUnit(null);
    load();
  };

  const handleDeleteIntervention = async (i: Intervention) => {
    if (!window.confirm(`¿Eliminar la intervención "${i.title}"? También se borran sus unidades.`)) {
      return;
    }
    const { error: deleteError } = await supabase.from("interventions").delete().eq("id", i.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const handleDeleteUnit = async (unitId: string) => {
    const { error: deleteError } = await supabase
      .from("intervention_units")
      .delete()
      .eq("id", unitId);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const handleExport = () => {
    const rows: Record<string, string | number | null>[] = [];
    for (const i of interventions) {
      const interventionUnits = units.filter((u) => u.intervention_id === i.id);
      const base = {
        "N° Parte": i.parte_number ?? "",
        Fecha: new Date(i.occurred_at).toLocaleString("es-AR"),
        Categoría: i.incident_category ?? "",
        Siniestro: i.title,
        Teléfono: i.caller_phone ?? "",
        Domicilio: i.address ?? "",
        Barrio: i.barrio ?? "",
        "A cargo": i.personnel_in_charge ?? "",
        Combustible: i.fuel_notes ?? "",
        Observaciones: i.observations ?? "",
      };
      if (interventionUnits.length === 0) {
        rows.push({
          ...base,
          Unidad: "",
          Chofer: "",
          "Hs salida": "",
          "Hs regreso": "",
          "Km salida": "",
          "Km regreso": "",
          "Recorrido (km)": "",
        });
      } else {
        for (const u of interventionUnits) {
          const recorrido =
            u.km_out != null && u.km_in != null ? Math.max(0, u.km_in - u.km_out) : "";
          rows.push({
            ...base,
            Unidad: vehicleName(u.vehicle_id),
            Chofer: personName(u.driver_id),
            "Hs salida": u.departed_at ? new Date(u.departed_at).toLocaleTimeString("es-AR") : "",
            "Hs regreso": u.returned_at ? new Date(u.returned_at).toLocaleTimeString("es-AR") : "",
            "Km salida": u.km_out ?? "",
            "Km regreso": u.km_in ?? "",
            "Recorrido (km)": recorrido,
          });
        }
      }
    }
    exportToExcel(rows, "intervenciones", "Intervenciones");
  };

  const knownBarrios = useMemo(
    () => Array.from(new Set(interventions.map((i) => i.barrio).filter((b): b is string => !!b))).sort(),
    [interventions]
  );

  // ---------- Estadísticas ----------
  const currentYear = new Date().getFullYear();
  const stats = useMemo(() => {
    const thisYear = interventions.filter(
      (i) => new Date(i.occurred_at).getFullYear() === currentYear
    );

    const byCategory = INCIDENT_CATEGORIES.map((cat) => ({
      label: cat,
      value: thisYear.filter((i) => i.incident_category === cat).length,
    }));

    const barrioCounts = new Map<string, number>();
    for (const i of thisYear) {
      if (i.barrio) barrioCounts.set(i.barrio, (barrioCounts.get(i.barrio) ?? 0) + 1);
    }
    const byBarrio = Array.from(barrioCounts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const byMonth = MESES.map((label, idx) => ({
      label,
      value: thisYear.filter((i) => new Date(i.occurred_at).getMonth() === idx).length,
    }));

    return { total: thisYear.length, byCategory, byBarrio, byMonth };
  }, [interventions, currentYear]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-neutral-900">Intervenciones</h1>
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
            + Nueva intervención
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white">
        <button
          onClick={() => setShowStats((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <p className="text-sm font-semibold text-neutral-800">
            📊 Estadísticas {currentYear} · {stats.total} intervenc
            {stats.total === 1 ? "ión" : "iones"}
          </p>
          <span className="text-xs text-neutral-400">{showStats ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showStats && (
          <div className="grid grid-cols-1 gap-6 border-t border-neutral-100 px-4 py-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                Por categoría
              </p>
              <StatsBarChart data={stats.byCategory} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                Por barrio (top 8)
              </p>
              <StatsBarChart data={stats.byBarrio} color="bg-emerald-500" />
            </div>
            <div className="lg:col-span-2">
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                Por mes
              </p>
              <StatsBarChart data={stats.byMonth} color="bg-orange-500" />
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título, ej: Incendio Estructural - Calle Falsa 123"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <select
            value={incidentCategory}
            onChange={(e) => setIncidentCategory(e.target.value as IncidentCategory)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Categoría / código de siniestro…</option>
            {INCIDENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={callerPhone}
            onChange={(e) => setCallerPhone(e.target.value)}
            placeholder="Teléfono de quien llamó"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={barrio}
            onChange={(e) => setBarrio(e.target.value)}
            placeholder="Barrio / localidad"
            list="barrios-conocidos"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <datalist id="barrios-conocidos">
            {knownBarrios.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Domicilio"
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <select
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Operador (opcional)</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <input
            value={personnelInCharge}
            onChange={(e) => setPersonnelInCharge(e.target.value)}
            placeholder="Personal a cargo (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={fuelNotes}
            onChange={(e) => setFuelNotes(e.target.value)}
            placeholder="Carga de combustible (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="Observaciones"
            rows={2}
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <button
            type="submit"
            className="rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark sm:col-span-2"
          >
            Guardar intervención
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : interventions.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
          Todavía no hay intervenciones registradas.
        </p>
      ) : (
        <div className="space-y-3">
          {interventions.map((i) => {
            const isExpanded = expanded === i.id;
            const interventionUnits = units.filter((u) => u.intervention_id === i.id);
            return (
              <div key={i.id} className="rounded-xl border border-neutral-200 bg-white">
                <button
                  onClick={() => setExpanded(isExpanded ? null : i.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <p className="font-semibold text-neutral-800">
                      {i.parte_number != null && (
                        <span className="mr-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-500">
                          Parte N° {i.parte_number}
                        </span>
                      )}
                      {i.title}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {new Date(i.occurred_at).toLocaleString("es-AR")}
                      {i.incident_category ? ` · ${i.incident_category}` : ""}
                      {i.barrio ? ` · ${i.barrio}` : ""}
                      {i.operator_id ? ` · Operador: ${personName(i.operator_id)}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-neutral-400">
                    {interventionUnits.length} unidad(es)
                  </span>
                </button>

                {isExpanded && (
                  <div className="space-y-3 border-t border-neutral-100 px-4 py-3">
                    <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                      {i.caller_phone && (
                        <p className="text-neutral-700">
                          <span className="font-medium">Teléfono:</span> {i.caller_phone}
                        </p>
                      )}
                      {i.address && (
                        <p className="text-neutral-700">
                          <span className="font-medium">Domicilio:</span> {i.address}
                        </p>
                      )}
                      {i.personnel_in_charge && (
                        <p className="text-neutral-700">
                          <span className="font-medium">Personal a cargo:</span>{" "}
                          {i.personnel_in_charge}
                        </p>
                      )}
                      {i.fuel_notes && (
                        <p className="text-neutral-700">
                          <span className="font-medium">Combustible:</span> {i.fuel_notes}
                        </p>
                      )}
                    </div>
                    {i.observations && (
                      <p className="text-sm text-neutral-700">
                        <span className="font-medium">Observaciones:</span> {i.observations}
                      </p>
                    )}

                    <button
                      onClick={() => handleDeleteIntervention(i)}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Eliminar intervención
                    </button>

                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-neutral-500">
                        Unidades
                      </p>
                      {interventionUnits.length === 0 ? (
                        <p className="text-sm text-neutral-500">Sin unidades asignadas.</p>
                      ) : (
                        <ul className="divide-y divide-neutral-100 text-sm">
                          {interventionUnits.map((u) => {
                            const recorrido =
                              u.km_out != null && u.km_in != null
                                ? Math.max(0, u.km_in - u.km_out)
                                : null;
                            return (
                              <li key={u.id} className="flex items-center justify-between py-1.5">
                                <div>
                                  <span>
                                    {vehicleName(u.vehicle_id)}
                                    {u.driver_id ? ` · Chofer: ${personName(u.driver_id)}` : ""}
                                  </span>
                                  <p className="text-xs text-neutral-500">
                                    {u.km_out != null ? `Km salida: ${u.km_out}` : "Sin km de salida"}
                                    {u.km_in != null ? ` · Km regreso: ${u.km_in}` : ""}
                                    {recorrido != null ? ` · Recorrido: ${recorrido} km` : ""}
                                  </p>
                                </div>
                                <div className="flex shrink-0 gap-3">
                                  <button
                                    onClick={() => openEditUnit(u)}
                                    className="text-xs font-medium text-brand hover:underline"
                                  >
                                    Cargar km / regreso
                                  </button>
                                  <button
                                    onClick={() => handleDeleteUnit(u.id)}
                                    className="text-xs font-medium text-red-700 hover:underline"
                                  >
                                    Quitar
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {addingUnitTo === i.id ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <select
                            value={unitVehicleId}
                            onChange={(e) => setUnitVehicleId(e.target.value)}
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          >
                            <option value="">Vehículo…</option>
                            {vehicles.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                          <select
                            value={unitDriverId}
                            onChange={(e) => setUnitDriverId(e.target.value)}
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          >
                            <option value="">Chofer (opcional)</option>
                            {personal.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.full_name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleAddUnit(i.id)}
                            className="rounded-md bg-brand px-3 py-1 text-sm font-medium text-white hover:bg-brand-dark"
                          >
                            Agregar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingUnitTo(i.id)}
                          className="mt-2 text-sm font-medium text-brand hover:underline"
                        >
                          + Agregar unidad
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingUnit && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setEditingUnit(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold text-neutral-900">
              {vehicleName(editingUnit.vehicle_id)}
            </h2>
            <p className="mb-4 text-sm text-neutral-500">Km y hora de regreso</p>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Km de salida</span>
                <input
                  type="number"
                  value={editKmOut}
                  onChange={(e) => setEditKmOut(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Km de regreso</span>
                <input
                  type="number"
                  value={editKmIn}
                  onChange={(e) => setEditKmIn(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">
                  Fecha y hora de regreso
                </span>
                <input
                  type="datetime-local"
                  value={editReturnedAt}
                  onChange={(e) => setEditReturnedAt(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditingUnit(null)}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                onClick={confirmEditUnit}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IntervencionesPage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "guardia"]}>
      <AppShell>
        <IntervencionesContent />
      </AppShell>
    </ProtectedRoute>
  );
}
