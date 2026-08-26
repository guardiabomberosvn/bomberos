"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { StatsBarChart } from "@/components/StatsBarChart";
import { PrintableParte } from "@/components/PrintableParte";
import { supabase } from "@/lib/supabase";
import { exportToExcel } from "@/lib/export";
import type {
  IncidentCategory,
  Intervention,
  InterventionUnit,
  InterventionDamagedVehicle,
  InterventionVictim,
  Profile,
  Vehicle,
  VictimRole,
  TriageColor,
} from "@/lib/types";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SUBTYPES,
  RESCUE_PERSON_STATUS,
  RESCUE_ANIMAL_STATUS,
  DAMAGE_TYPES,
  VICTIM_ROLES,
  TRIAGE_COLORS,
} from "@/lib/types";

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const emptyVictimForm: Partial<InterventionVictim> = {
  role: null,
  injured: false,
  transferred: false,
  triage_color: null,
};

const emptyVehicleForm: Partial<InterventionDamagedVehicle> = {};

function IntervencionesContent() {
  const { profile } = useAuth();
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [units, setUnits] = useState<InterventionUnit[]>([]);
  const [damagedVehicles, setDamagedVehicles] = useState<InterventionDamagedVehicle[]>([]);
  const [victims, setVictims] = useState<InterventionVictim[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [personal, setPersonal] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [title, setTitle] = useState("");
  const [incidentCategory, setIncidentCategory] = useState<IncidentCategory | "">("");
  const [callerPhone, setCallerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [barrio, setBarrio] = useState("");
  const [personnelInCharge, setPersonnelInCharge] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [fuelNotes, setFuelNotes] = useState("");
  const [observations, setObservations] = useState("");

  // 1- Aviso efectuado por
  const [reporterName, setReporterName] = useState("");
  const [reporterDni, setReporterDni] = useState("");
  // 2- Lugar del siniestro
  const [crossStreet, setCrossStreet] = useState("");
  // 3- Tipo / Motivo / guardia / horarios generales
  const [tipoCode, setTipoCode] = useState("");
  const [motivoCode, setMotivoCode] = useState("");
  const [referenceCode, setReferenceCode] = useState("");
  const [guardDeparture, setGuardDeparture] = useState("");
  const [guardReturn, setGuardReturn] = useState("");
  const [departedAt, setDepartedAt] = useState("");
  const [returnedAt, setReturnedAt] = useState("");
  // Clasificación
  const [incidentSubtype, setIncidentSubtype] = useState("");
  const [incidentSubtypeDetail, setIncidentSubtypeDetail] = useState("");
  // Apoyo solicitado
  const [supportRequested, setSupportRequested] = useState(false);
  const [supportUnitNumber, setSupportUnitNumber] = useState("");
  // 6- Incendio: datos sobre lo dañado
  const [damageVictimName, setDamageVictimName] = useState("");
  const [damageVictimAge, setDamageVictimAge] = useState("");
  const [damageVictimDni, setDamageVictimDni] = useState("");
  const [damageType, setDamageType] = useState("");
  const [involvedPolicial, setInvolvedPolicial] = useState(false);
  const [involvedTransito, setInvolvedTransito] = useState(false);
  const [involvedForense, setInvolvedForense] = useState(false);
  const [involvedJuzgado, setInvolvedJuzgado] = useState(false);
  const [mobileUnitNumber, setMobileUnitNumber] = useState("");
  const [inCharge1, setInCharge1] = useState("");
  const [inCharge2, setInCharge2] = useState("");
  // 7- Negación de atención médica
  const [medicalRefusal, setMedicalRefusal] = useState(false);
  const [medicalRefusalName, setMedicalRefusalName] = useState("");
  const [medicalRefusalDni, setMedicalRefusalDni] = useState("");

  const [addingUnitTo, setAddingUnitTo] = useState<string | null>(null);
  const [unitVehicleId, setUnitVehicleId] = useState("");
  const [unitDriverId, setUnitDriverId] = useState("");
  const [unitPersonnelInCharge, setUnitPersonnelInCharge] = useState("");
  const [unitCrew1, setUnitCrew1] = useState("");
  const [unitCrew2, setUnitCrew2] = useState("");
  const [unitCrew3, setUnitCrew3] = useState("");

  const [editingUnit, setEditingUnit] = useState<InterventionUnit | null>(null);
  const [editKmOut, setEditKmOut] = useState("");
  const [editKmIn, setEditKmIn] = useState("");
  const [editReturnedAt, setEditReturnedAt] = useState("");
  const [editPersonnelInCharge, setEditPersonnelInCharge] = useState("");
  const [editCrew1, setEditCrew1] = useState("");
  const [editCrew2, setEditCrew2] = useState("");
  const [editCrew3, setEditCrew3] = useState("");

  const [addingVehicleTo, setAddingVehicleTo] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState<Partial<InterventionDamagedVehicle>>(emptyVehicleForm);

  const [addingVictimTo, setAddingVictimTo] = useState<string | null>(null);
  const [victimForm, setVictimForm] = useState<Partial<InterventionVictim>>(emptyVictimForm);

  const [printTarget, setPrintTarget] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: i } = await supabase
      .from("interventions")
      .select("*")
      .order("occurred_at", { ascending: false });
    const { data: u } = await supabase.from("intervention_units").select("*");
    const { data: dv } = await supabase.from("intervention_damaged_vehicles").select("*");
    const { data: vic } = await supabase.from("intervention_victims").select("*");
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
    setDamagedVehicles((dv as InterventionDamagedVehicle[]) ?? []);
    setVictims((vic as InterventionVictim[]) ?? []);
    setVehicles((v as Vehicle[]) ?? []);
    setPersonal((p as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Reloj en vivo: mientras el formulario está abierto, muestra la fecha y
  // hora que se va a guardar automáticamente (se actualiza solo). También
  // sugiere como "Guardia" a quien tiene la sesión iniciada.
  useEffect(() => {
    if (!showForm) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    setGuardDeparture((g) => g || profile?.full_name || "");
    return () => clearInterval(id);
  }, [showForm, profile]);

  // Al cambiar la categoría, se resetea el subtipo (evita subtipos de otra
  // categoría quedando marcados).
  useEffect(() => {
    setIncidentSubtype("");
    setIncidentSubtypeDetail("");
  }, [incidentCategory]);

  // Imprimir / descargar PDF: cuando se elige un parte, se renderiza su
  // versión imprimible (oculta en pantalla) y se dispara el diálogo de
  // impresión del navegador, donde se puede elegir "Guardar como PDF".
  useEffect(() => {
    if (!printTarget) return;
    const t = setTimeout(() => window.print(), 80);
    const onAfterPrint = () => setPrintTarget(null);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [printTarget]);

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
      // Fecha y hora: automáticas, el momento exacto en que se guarda el parte.
      occurred_at: new Date().toISOString(),
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
      reporter_name: reporterName.trim() || null,
      reporter_dni: reporterDni.trim() || null,
      cross_street: crossStreet.trim() || null,
      tipo_code: tipoCode.trim() || null,
      motivo_code: motivoCode.trim() || null,
      reference_code: referenceCode.trim() || null,
      guard_departure: guardDeparture.trim() || null,
      guard_return: guardReturn.trim() || null,
      departed_at: departedAt ? new Date(departedAt).toISOString() : null,
      returned_at: returnedAt ? new Date(returnedAt).toISOString() : null,
      incident_subtype: incidentSubtype || null,
      incident_subtype_detail: incidentSubtypeDetail.trim() || null,
      support_requested: supportRequested,
      support_unit_number: supportUnitNumber.trim() || null,
      damage_victim_name: damageVictimName.trim() || null,
      damage_victim_age: damageVictimAge.trim() || null,
      damage_victim_dni: damageVictimDni.trim() || null,
      damage_type: damageType || null,
      involved_policial: involvedPolicial,
      involved_transito: involvedTransito,
      involved_forense: involvedForense,
      involved_juzgado: involvedJuzgado,
      mobile_unit_number: mobileUnitNumber.trim() || null,
      in_charge_1: inCharge1.trim() || null,
      in_charge_2: inCharge2.trim() || null,
      medical_refusal: medicalRefusal,
      medical_refusal_name: medicalRefusal ? medicalRefusalName.trim() || null : null,
      medical_refusal_dni: medicalRefusal ? medicalRefusalDni.trim() || null : null,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setTitle("");
    setIncidentCategory("");
    setCallerPhone("");
    setAddress("");
    setBarrio("");
    setPersonnelInCharge("");
    setOperatorId("");
    setFuelNotes("");
    setObservations("");
    setReporterName("");
    setReporterDni("");
    setCrossStreet("");
    setTipoCode("");
    setMotivoCode("");
    setReferenceCode("");
    setGuardDeparture("");
    setGuardReturn("");
    setDepartedAt("");
    setReturnedAt("");
    setIncidentSubtype("");
    setIncidentSubtypeDetail("");
    setSupportRequested(false);
    setSupportUnitNumber("");
    setDamageVictimName("");
    setDamageVictimAge("");
    setDamageVictimDni("");
    setDamageType("");
    setInvolvedPolicial(false);
    setInvolvedTransito(false);
    setInvolvedForense(false);
    setInvolvedJuzgado(false);
    setMobileUnitNumber("");
    setInCharge1("");
    setInCharge2("");
    setMedicalRefusal(false);
    setMedicalRefusalName("");
    setMedicalRefusalDni("");
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
      personnel_in_charge: unitPersonnelInCharge.trim() || null,
      crew_member_1: unitCrew1.trim() || null,
      crew_member_2: unitCrew2.trim() || null,
      crew_member_3: unitCrew3.trim() || null,
    });
    if (insertError) setError(insertError.message);
    setUnitVehicleId("");
    setUnitDriverId("");
    setUnitPersonnelInCharge("");
    setUnitCrew1("");
    setUnitCrew2("");
    setUnitCrew3("");
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
    setEditPersonnelInCharge(u.personnel_in_charge ?? "");
    setEditCrew1(u.crew_member_1 ?? "");
    setEditCrew2(u.crew_member_2 ?? "");
    setEditCrew3(u.crew_member_3 ?? "");
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
        personnel_in_charge: editPersonnelInCharge.trim() || null,
        crew_member_1: editCrew1.trim() || null,
        crew_member_2: editCrew2.trim() || null,
        crew_member_3: editCrew3.trim() || null,
      })
      .eq("id", editingUnit.id);
    if (updateError) setError(updateError.message);
    setEditingUnit(null);
    load();
  };

  const handleDeleteIntervention = async (i: Intervention) => {
    if (!window.confirm(`¿Eliminar la intervención "${i.title}"? También se borran sus unidades, vehículos y damnificados.`)) {
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

  const handleAddDamagedVehicle = async (interventionId: string) => {
    const { error: insertError } = await supabase.from("intervention_damaged_vehicles").insert({
      intervention_id: interventionId,
      vehicle_number: vehicleForm.vehicle_number ?? null,
      brand: vehicleForm.brand?.trim() || null,
      model: vehicleForm.model?.trim() || null,
      plate: vehicleForm.plate?.trim() || null,
      insurance: vehicleForm.insurance?.trim() || null,
      policy_number: vehicleForm.policy_number?.trim() || null,
    });
    if (insertError) setError(insertError.message);
    setVehicleForm(emptyVehicleForm);
    setAddingVehicleTo(null);
    load();
  };

  const handleDeleteDamagedVehicle = async (id: string) => {
    const { error: deleteError } = await supabase.from("intervention_damaged_vehicles").delete().eq("id", id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const handleAddVictim = async (interventionId: string) => {
    const { error: insertError } = await supabase.from("intervention_victims").insert({
      intervention_id: interventionId,
      vehicle_number: victimForm.vehicle_number ?? null,
      role: (victimForm.role as VictimRole) || null,
      full_name: victimForm.full_name?.trim() || null,
      age: victimForm.age?.trim() || null,
      dni: victimForm.dni?.trim() || null,
      address: victimForm.address?.trim() || null,
      address_number: victimForm.address_number?.trim() || null,
      locality: victimForm.locality?.trim() || null,
      province: victimForm.province?.trim() || null,
      phone: victimForm.phone?.trim() || null,
      injured: !!victimForm.injured,
      triage_color: (victimForm.triage_color as TriageColor) || null,
      transferred: !!victimForm.transferred,
      transferred_by: victimForm.transferred_by?.trim() || null,
      transferred_to: victimForm.transferred_to?.trim() || null,
      receiving_doctor: victimForm.receiving_doctor?.trim() || null,
    });
    if (insertError) setError(insertError.message);
    setVictimForm(emptyVictimForm);
    setAddingVictimTo(null);
    load();
  };

  const handleDeleteVictim = async (id: string) => {
    const { error: deleteError } = await supabase.from("intervention_victims").delete().eq("id", id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const handleMarkReviewed = async (i: Intervention) => {
    if (!profile) return;
    const { error: updateError } = await supabase
      .from("interventions")
      .update({ reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      .eq("id", i.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleExport = () => {
    const rows: Record<string, string | number | null>[] = [];
    for (const i of interventions) {
      const interventionUnits = units.filter((u) => u.intervention_id === i.id);
      const base = {
        "N° Parte": i.parte_number != null ? `${i.parte_number}/${i.parte_year ?? new Date(i.occurred_at).getFullYear()}` : "",
        Fecha: new Date(i.occurred_at).toLocaleString("es-AR"),
        Categoría: i.incident_category ?? "",
        Subtipo: i.incident_subtype ?? "",
        Siniestro: i.title,
        "Aviso de": i.reporter_name ?? "",
        Teléfono: i.caller_phone ?? "",
        Domicilio: i.address ?? "",
        "Entre calle": i.cross_street ?? "",
        Barrio: i.barrio ?? "",
        Tipo: i.tipo_code ?? "",
        Motivo: i.motivo_code ?? "",
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

  // Sugerencias (autocompletado) a partir de lo ya cargado antes, para
  // agilizar la carga de los partes siguientes.
  const knownAddresses = useMemo(
    () => Array.from(new Set(interventions.map((i) => i.address).filter((a): a is string => !!a))).sort(),
    [interventions]
  );
  const knownPersonnel = useMemo(
    () =>
      Array.from(
        new Set(interventions.map((i) => i.personnel_in_charge).filter((p): p is string => !!p))
      ).sort(),
    [interventions]
  );
  const knownTitles = useMemo(
    () => Array.from(new Set(interventions.map((i) => i.title).filter((t): t is string => !!t))).sort(),
    [interventions]
  );
  const knownReporters = useMemo(
    () => Array.from(new Set(interventions.map((i) => i.reporter_name).filter((r): r is string => !!r))).sort(),
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

  const printIntervention = printTarget ? interventions.find((x) => x.id === printTarget) : null;

  return (
    <>
    <div className="space-y-6 no-print">
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
            list="titulos-conocidos"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <datalist id="titulos-conocidos">
            {knownTitles.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <div className="flex flex-col justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 sm:col-span-2">
            <span className="text-xs font-medium uppercase text-neutral-400">
              Fecha, hora y N° de parte — automáticos
            </span>
            <span className="text-sm text-neutral-700">
              Se va a guardar con el momento actual: {now.toLocaleString("es-AR")}
            </span>
          </div>

          <p className="text-xs font-semibold uppercase text-neutral-500 sm:col-span-2">
            1- Aviso efectuado por
          </p>
          <input
            value={reporterName}
            onChange={(e) => setReporterName(e.target.value)}
            placeholder="Nombre de quien avisó"
            list="avisos-conocidos"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <datalist id="avisos-conocidos">
            {knownReporters.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <input
            value={callerPhone}
            onChange={(e) => setCallerPhone(e.target.value)}
            placeholder="Teléfono de quien llamó"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={reporterDni}
            onChange={(e) => setReporterDni(e.target.value)}
            placeholder="DNI de quien avisó"
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />

          <p className="text-xs font-semibold uppercase text-neutral-500 sm:col-span-2">
            2- Lugar del siniestro
          </p>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Domicilio"
            list="domicilios-conocidos"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <datalist id="domicilios-conocidos">
            {knownAddresses.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <input
            value={crossStreet}
            onChange={(e) => setCrossStreet(e.target.value)}
            placeholder="Entre calle"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={barrio}
            onChange={(e) => setBarrio(e.target.value)}
            placeholder="Barrio / localidad"
            list="barrios-conocidos"
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <datalist id="barrios-conocidos">
            {knownBarrios.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>

          <p className="text-xs font-semibold uppercase text-neutral-500 sm:col-span-2">
            3- Tipo, motivo y guardia
          </p>
          <input
            value={tipoCode}
            onChange={(e) => setTipoCode(e.target.value)}
            placeholder="Tipo (código)"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={motivoCode}
            onChange={(e) => setMotivoCode(e.target.value)}
            placeholder="Motivo (código)"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={referenceCode}
            onChange={(e) => setReferenceCode(e.target.value)}
            placeholder="Referencia (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-500">Guardia (salida)</span>
            <input
              value={guardDeparture}
              onChange={(e) => setGuardDeparture(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-500">Hs. Salida</span>
            <input
              type="datetime-local"
              value={departedAt}
              onChange={(e) => setDepartedAt(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-500">Hs. Llegada</span>
            <input
              type="datetime-local"
              value={returnedAt}
              onChange={(e) => setReturnedAt(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-500">Guardia (llegada)</span>
            <input
              value={guardReturn}
              onChange={(e) => setGuardReturn(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>

          <p className="text-xs font-semibold uppercase text-neutral-500 sm:col-span-2">
            Clasificación del siniestro
          </p>
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
          {incidentCategory && INCIDENT_SUBTYPES[incidentCategory] && (
            <select
              value={incidentSubtype}
              onChange={(e) => setIncidentSubtype(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2"
            >
              <option value="">Subtipo…</option>
              {INCIDENT_SUBTYPES[incidentCategory].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {incidentCategory === "Rescate" && incidentSubtype === "Persona" && (
            <select
              value={incidentSubtypeDetail}
              onChange={(e) => setIncidentSubtypeDetail(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
            >
              <option value="">Estado de la persona…</option>
              {RESCUE_PERSON_STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {incidentCategory === "Rescate" && incidentSubtype === "Animal" && (
            <select
              value={incidentSubtypeDetail}
              onChange={(e) => setIncidentSubtypeDetail(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
            >
              <option value="">Estado del animal…</option>
              {RESCUE_ANIMAL_STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {incidentCategory &&
            incidentSubtype &&
            incidentCategory !== "Rescate" &&
            incidentSubtype.match(/otro/i) && (
              <input
                value={incidentSubtypeDetail}
                onChange={(e) => setIncidentSubtypeDetail(e.target.value)}
                placeholder='Detalle de "Otro/s", ej: Horno'
                className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
              />
            )}

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={supportRequested}
              onChange={(e) => setSupportRequested(e.target.checked)}
            />
            Se solicitó apoyo
          </label>
          {supportRequested && (
            <input
              value={supportUnitNumber}
              onChange={(e) => setSupportUnitNumber(e.target.value)}
              placeholder="Unidad en apoyo a U N°"
              className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
            />
          )}

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
            list="personal-a-cargo-conocido"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <datalist id="personal-a-cargo-conocido">
            {knownPersonnel.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <input
            value={fuelNotes}
            onChange={(e) => setFuelNotes(e.target.value)}
            placeholder="Carga de combustible (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />

          <p className="text-xs font-semibold uppercase text-neutral-500 sm:col-span-2">
            6- Incendio: datos sobre lo dañado (opcional)
          </p>
          <input
            value={damageVictimName}
            onChange={(e) => setDamageVictimName(e.target.value)}
            placeholder="Apellido y nombre del damnificado"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <div className="flex gap-2">
            <input
              value={damageVictimAge}
              onChange={(e) => setDamageVictimAge(e.target.value)}
              placeholder="Edad"
              className="w-1/2 rounded-md border border-neutral-300 px-3 py-2"
            />
            <input
              value={damageVictimDni}
              onChange={(e) => setDamageVictimDni(e.target.value)}
              placeholder="DNI"
              className="w-1/2 rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
          <select
            value={damageType}
            onChange={(e) => setDamageType(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          >
            <option value="">Qué se dañó…</option>
            {DAMAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-3 text-sm sm:col-span-2">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={involvedPolicial} onChange={(e) => setInvolvedPolicial(e.target.checked)} />
              Policial
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={involvedTransito} onChange={(e) => setInvolvedTransito(e.target.checked)} />
              Tránsito
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={involvedForense} onChange={(e) => setInvolvedForense(e.target.checked)} />
              Forense
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={involvedJuzgado} onChange={(e) => setInvolvedJuzgado(e.target.checked)} />
              Juzgado
            </label>
          </div>
          <input
            value={mobileUnitNumber}
            onChange={(e) => setMobileUnitNumber(e.target.value)}
            placeholder="N° de móvil (policial/tránsito)"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <div className="flex gap-2">
            <input
              value={inCharge1}
              onChange={(e) => setInCharge1(e.target.value)}
              placeholder="A cargo"
              className="w-1/2 rounded-md border border-neutral-300 px-3 py-2"
            />
            <input
              value={inCharge2}
              onChange={(e) => setInCharge2(e.target.value)}
              placeholder="A cargo (2°)"
              className="w-1/2 rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>

          <p className="text-xs font-semibold uppercase text-neutral-500 sm:col-span-2">
            7- Negación de atención médica
          </p>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={medicalRefusal}
              onChange={(e) => setMedicalRefusal(e.target.checked)}
            />
            El/la damnificado/a se negó a recibir atención médica
          </label>
          {medicalRefusal && (
            <>
              <input
                value={medicalRefusalName}
                onChange={(e) => setMedicalRefusalName(e.target.value)}
                placeholder="Nombre de quien se niega"
                className="rounded-md border border-neutral-300 px-3 py-2"
              />
              <input
                value={medicalRefusalDni}
                onChange={(e) => setMedicalRefusalDni(e.target.value)}
                placeholder="DNI"
                className="rounded-md border border-neutral-300 px-3 py-2"
              />
            </>
          )}

          <p className="text-xs font-semibold uppercase text-neutral-500 sm:col-span-2">
            8- Observaciones
          </p>
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="Observaciones"
            rows={3}
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />

          <p className="text-xs text-neutral-500 sm:col-span-2">
            Los vehículos siniestrados y los damnificados se agregan después de guardar, desde
            dentro del parte. El botón &quot;Descargar PDF&quot; arma el parte completo, listo para
            firmar e imprimir.
          </p>

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
            const interventionVehicles = damagedVehicles.filter((d) => d.intervention_id === i.id);
            const interventionVictims = victims.filter((v) => v.intervention_id === i.id);
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
                          Parte N° {i.parte_number}/{i.parte_year ?? new Date(i.occurred_at).getFullYear()}
                        </span>
                      )}
                      {i.title}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {new Date(i.occurred_at).toLocaleString("es-AR")}
                      {i.incident_category ? ` · ${i.incident_category}` : ""}
                      {i.incident_subtype ? ` (${i.incident_subtype})` : ""}
                      {i.barrio ? ` · ${i.barrio}` : ""}
                      {i.operator_id ? ` · Operador: ${personName(i.operator_id)}` : ""}
                      {i.reviewed_by ? " · ✅ Revisado" : ""}
                    </p>
                  </div>
                  <span className="text-xs text-neutral-400">
                    {interventionUnits.length} unidad(es)
                  </span>
                </button>

                {isExpanded && (
                  <div className="space-y-4 border-t border-neutral-100 px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setPrintTarget(i.id)}
                        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        🖨️ Descargar / Imprimir PDF
                      </button>
                      {profile?.role === "admin" && !i.reviewed_by && (
                        <button
                          onClick={() => handleMarkReviewed(i)}
                          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          ✅ Marcar como revisado
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteIntervention(i)}
                        className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Eliminar intervención
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                      {i.reporter_name && (
                        <p className="text-neutral-700">
                          <span className="font-medium">Aviso de:</span> {i.reporter_name}
                          {i.reporter_dni ? ` (DNI ${i.reporter_dni})` : ""}
                        </p>
                      )}
                      {i.caller_phone && (
                        <p className="text-neutral-700">
                          <span className="font-medium">Teléfono:</span> {i.caller_phone}
                        </p>
                      )}
                      {i.address && (
                        <p className="text-neutral-700">
                          <span className="font-medium">Domicilio:</span> {i.address}
                          {i.cross_street ? ` entre ${i.cross_street}` : ""}
                        </p>
                      )}
                      {(i.tipo_code || i.motivo_code) && (
                        <p className="text-neutral-700">
                          <span className="font-medium">Tipo/Motivo:</span> {i.tipo_code} / {i.motivo_code}
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
                      {i.support_requested && (
                        <p className="text-neutral-700">
                          <span className="font-medium">Apoyo solicitado:</span> U N° {i.support_unit_number || "—"}
                        </p>
                      )}
                      {i.medical_refusal && (
                        <p className="text-neutral-700">
                          <span className="font-medium">⚠️ Negó atención médica:</span> {i.medical_refusal_name}
                        </p>
                      )}
                    </div>
                    {i.observations && (
                      <p className="text-sm text-neutral-700">
                        <span className="font-medium">Observaciones:</span> {i.observations}
                      </p>
                    )}

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
                            const crew = [u.crew_member_1, u.crew_member_2, u.crew_member_3].filter(Boolean);
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
                                    {u.personnel_in_charge ? ` · A cargo: ${u.personnel_in_charge}` : ""}
                                    {crew.length ? ` · Concurrió: ${crew.join(", ")}` : ""}
                                  </p>
                                </div>
                                <div className="flex shrink-0 gap-3">
                                  <button
                                    onClick={() => openEditUnit(u)}
                                    className="text-xs font-medium text-brand hover:underline"
                                  >
                                    Editar
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
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                          <input
                            value={unitPersonnelInCharge}
                            onChange={(e) => setUnitPersonnelInCharge(e.target.value)}
                            placeholder="Personal a cargo"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm sm:col-span-2"
                          />
                          <input
                            value={unitCrew1}
                            onChange={(e) => setUnitCrew1(e.target.value)}
                            placeholder="Personal que concurrió (1)"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={unitCrew2}
                            onChange={(e) => setUnitCrew2(e.target.value)}
                            placeholder="Personal que concurrió (2)"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={unitCrew3}
                            onChange={(e) => setUnitCrew3(e.target.value)}
                            placeholder="Personal que concurrió (3)"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm sm:col-span-2"
                          />
                          <button
                            onClick={() => handleAddUnit(i.id)}
                            className="rounded-md bg-brand px-3 py-1 text-sm font-medium text-white hover:bg-brand-dark sm:col-span-2"
                          >
                            Agregar unidad
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

                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-neutral-500">
                        Vehículos siniestrados
                      </p>
                      {interventionVehicles.length === 0 ? (
                        <p className="text-sm text-neutral-500">Sin vehículos cargados.</p>
                      ) : (
                        <ul className="divide-y divide-neutral-100 text-sm">
                          {interventionVehicles.map((dv) => (
                            <li key={dv.id} className="flex items-center justify-between py-1.5">
                              <span>
                                {dv.vehicle_number ? `${dv.vehicle_number}° · ` : ""}
                                {[dv.brand, dv.model, dv.plate].filter(Boolean).join(" · ") || "—"}
                                {dv.insurance ? ` · Seguro: ${dv.insurance}` : ""}
                                {dv.policy_number ? ` (Póliza ${dv.policy_number})` : ""}
                              </span>
                              <button
                                onClick={() => handleDeleteDamagedVehicle(dv.id)}
                                className="text-xs font-medium text-red-700 hover:underline"
                              >
                                Quitar
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {addingVehicleTo === i.id ? (
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <input
                            type="number"
                            value={vehicleForm.vehicle_number ?? ""}
                            onChange={(e) =>
                              setVehicleForm((f) => ({ ...f, vehicle_number: e.target.value ? Number(e.target.value) : undefined }))
                            }
                            placeholder="Rodado N°"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={vehicleForm.brand ?? ""}
                            onChange={(e) => setVehicleForm((f) => ({ ...f, brand: e.target.value }))}
                            placeholder="Marca"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={vehicleForm.model ?? ""}
                            onChange={(e) => setVehicleForm((f) => ({ ...f, model: e.target.value }))}
                            placeholder="Modelo"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={vehicleForm.plate ?? ""}
                            onChange={(e) => setVehicleForm((f) => ({ ...f, plate: e.target.value }))}
                            placeholder="Dominio"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={vehicleForm.insurance ?? ""}
                            onChange={(e) => setVehicleForm((f) => ({ ...f, insurance: e.target.value }))}
                            placeholder="Seguro"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={vehicleForm.policy_number ?? ""}
                            onChange={(e) => setVehicleForm((f) => ({ ...f, policy_number: e.target.value }))}
                            placeholder="Póliza"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <button
                            onClick={() => handleAddDamagedVehicle(i.id)}
                            className="rounded-md bg-brand px-3 py-1 text-sm font-medium text-white hover:bg-brand-dark sm:col-span-3"
                          >
                            Agregar vehículo
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingVehicleTo(i.id)}
                          className="mt-2 text-sm font-medium text-brand hover:underline"
                        >
                          + Agregar vehículo siniestrado
                        </button>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-neutral-500">
                        Damnificados
                      </p>
                      {interventionVictims.length === 0 ? (
                        <p className="text-sm text-neutral-500">Sin damnificados cargados.</p>
                      ) : (
                        <ul className="divide-y divide-neutral-100 text-sm">
                          {interventionVictims.map((v) => (
                            <li key={v.id} className="flex items-center justify-between py-1.5">
                              <span>
                                {v.full_name || "—"}
                                {v.role ? ` · ${VICTIM_ROLES.find((r) => r.value === v.role)?.label}` : ""}
                                {v.injured ? " · Herido" : ""}
                                {v.triage_color ? ` · ${TRIAGE_COLORS.find((c) => c.value === v.triage_color)?.label}` : ""}
                                {v.transferred ? " · Trasladado" : ""}
                              </span>
                              <button
                                onClick={() => handleDeleteVictim(v.id)}
                                className="text-xs font-medium text-red-700 hover:underline"
                              >
                                Quitar
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {addingVictimTo === i.id ? (
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <select
                            value={victimForm.role ?? ""}
                            onChange={(e) => setVictimForm((f) => ({ ...f, role: (e.target.value || null) as VictimRole | null }))}
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          >
                            <option value="">Rol…</option>
                            {VICTIM_ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={victimForm.vehicle_number ?? ""}
                            onChange={(e) =>
                              setVictimForm((f) => ({ ...f, vehicle_number: e.target.value ? Number(e.target.value) : undefined }))
                            }
                            placeholder="Rodado N° (si corresponde)"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={victimForm.full_name ?? ""}
                            onChange={(e) => setVictimForm((f) => ({ ...f, full_name: e.target.value }))}
                            placeholder="Apellido y nombre"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm sm:col-span-2"
                          />
                          <input
                            value={victimForm.age ?? ""}
                            onChange={(e) => setVictimForm((f) => ({ ...f, age: e.target.value }))}
                            placeholder="Edad"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={victimForm.dni ?? ""}
                            onChange={(e) => setVictimForm((f) => ({ ...f, dni: e.target.value }))}
                            placeholder="DNI"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={victimForm.address ?? ""}
                            onChange={(e) => setVictimForm((f) => ({ ...f, address: e.target.value }))}
                            placeholder="Domicilio"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={victimForm.address_number ?? ""}
                            onChange={(e) => setVictimForm((f) => ({ ...f, address_number: e.target.value }))}
                            placeholder="N°"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={victimForm.locality ?? ""}
                            onChange={(e) => setVictimForm((f) => ({ ...f, locality: e.target.value }))}
                            placeholder="Localidad"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={victimForm.province ?? ""}
                            onChange={(e) => setVictimForm((f) => ({ ...f, province: e.target.value }))}
                            placeholder="Provincia"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={victimForm.phone ?? ""}
                            onChange={(e) => setVictimForm((f) => ({ ...f, phone: e.target.value }))}
                            placeholder="N° Tel."
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm sm:col-span-2"
                          />
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!victimForm.injured}
                              onChange={(e) => setVictimForm((f) => ({ ...f, injured: e.target.checked }))}
                            />
                            Herido
                          </label>
                          <select
                            value={victimForm.triage_color ?? ""}
                            onChange={(e) =>
                              setVictimForm((f) => ({ ...f, triage_color: (e.target.value || null) as TriageColor | null }))
                            }
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          >
                            <option value="">Color de triage…</option>
                            {TRIAGE_COLORS.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!victimForm.transferred}
                              onChange={(e) => setVictimForm((f) => ({ ...f, transferred: e.target.checked }))}
                            />
                            Trasladado
                          </label>
                          {victimForm.transferred && (
                            <>
                              <input
                                value={victimForm.transferred_by ?? ""}
                                onChange={(e) => setVictimForm((f) => ({ ...f, transferred_by: e.target.value }))}
                                placeholder="Trasladado por"
                                className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                              />
                              <input
                                value={victimForm.transferred_to ?? ""}
                                onChange={(e) => setVictimForm((f) => ({ ...f, transferred_to: e.target.value }))}
                                placeholder="Hacia"
                                className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                              />
                              <input
                                value={victimForm.receiving_doctor ?? ""}
                                onChange={(e) => setVictimForm((f) => ({ ...f, receiving_doctor: e.target.value }))}
                                placeholder="Recibe Dr/a"
                                className="rounded-md border border-neutral-300 px-2 py-1 text-sm sm:col-span-2"
                              />
                            </>
                          )}
                          <button
                            onClick={() => handleAddVictim(i.id)}
                            className="rounded-md bg-brand px-3 py-1 text-sm font-medium text-white hover:bg-brand-dark sm:col-span-2"
                          >
                            Agregar damnificado
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingVictimTo(i.id)}
                          className="mt-2 text-sm font-medium text-brand hover:underline"
                        >
                          + Agregar damnificado
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
            <p className="mb-4 text-sm text-neutral-500">Km, regreso y personal</p>
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
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Personal a cargo</span>
                <input
                  value={editPersonnelInCharge}
                  onChange={(e) => setEditPersonnelInCharge(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Personal que concurrió</span>
                <div className="space-y-2">
                  <input
                    value={editCrew1}
                    onChange={(e) => setEditCrew1(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2"
                  />
                  <input
                    value={editCrew2}
                    onChange={(e) => setEditCrew2(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2"
                  />
                  <input
                    value={editCrew3}
                    onChange={(e) => setEditCrew3(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2"
                  />
                </div>
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

      {printIntervention && (
        <PrintableParte
          intervention={printIntervention}
          units={units.filter((u) => u.intervention_id === printIntervention.id)}
          damagedVehicles={damagedVehicles.filter((d) => d.intervention_id === printIntervention.id)}
          victims={victims.filter((v) => v.intervention_id === printIntervention.id)}
          vehicles={vehicles}
          personal={personal}
        />
      )}
    </>
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
