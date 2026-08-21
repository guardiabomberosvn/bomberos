"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import type {
  Intervention,
  InterventionUnit,
  Profile,
  Vehicle,
} from "@/lib/types";

function IntervencionesContent() {
  const { profile } = useAuth();
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [units, setUnits] = useState<InterventionUnit[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [personal, setPersonal] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [personnelInCharge, setPersonnelInCharge] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [observations, setObservations] = useState("");

  const [addingUnitTo, setAddingUnitTo] = useState<string | null>(null);
  const [unitVehicleId, setUnitVehicleId] = useState("");
  const [unitDriverId, setUnitDriverId] = useState("");

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

    const { error: insertError } = await supabase.from("interventions").insert({
      organization_id: profile.organization_id,
      title: title.trim(),
      occurred_at: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
      personnel_in_charge: personnelInCharge.trim() || null,
      operator_id: operatorId || null,
      observations: observations.trim() || null,
      created_by: profile.id,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setTitle("");
    setOccurredAt("");
    setPersonnelInCharge("");
    setOperatorId("");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Intervenciones</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Nueva intervención
        </button>
      </div>

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
                    <p className="font-semibold text-neutral-800">{i.title}</p>
                    <p className="text-xs text-neutral-500">
                      {new Date(i.occurred_at).toLocaleString("es-AR")}
                      {i.operator_id ? ` · Operador: ${personName(i.operator_id)}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-neutral-400">
                    {interventionUnits.length} unidad(es)
                  </span>
                </button>

                {isExpanded && (
                  <div className="space-y-3 border-t border-neutral-100 px-4 py-3">
                    {i.personnel_in_charge && (
                      <p className="text-sm text-neutral-700">
                        <span className="font-medium">Personal a cargo:</span>{" "}
                        {i.personnel_in_charge}
                      </p>
                    )}
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
                          {interventionUnits.map((u) => (
                            <li key={u.id} className="flex items-center justify-between py-1.5">
                              <span>
                                {vehicleName(u.vehicle_id)}
                                {u.driver_id ? ` · Chofer: ${personName(u.driver_id)}` : ""}
                              </span>
                              <button
                                onClick={() => handleDeleteUnit(u.id)}
                                className="text-xs font-medium text-red-700 hover:underline"
                              >
                                Quitar
                              </button>
                            </li>
                          ))}
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
