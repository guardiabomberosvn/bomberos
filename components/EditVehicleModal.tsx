"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Vehicle } from "@/lib/types";

export function EditVehicleModal({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(vehicle.name);
  const [type, setType] = useState(vehicle.type ?? "");
  const [brand, setBrand] = useState(vehicle.brand ?? "");
  const [model, setModel] = useState(vehicle.model ?? "");
  const [licensePlate, setLicensePlate] = useState(vehicle.license_plate ?? "");
  const [chassisNumber, setChassisNumber] = useState(vehicle.chassis_number ?? "");
  const [engineNumber, setEngineNumber] = useState(vehicle.engine_number ?? "");
  const [tankLiters, setTankLiters] = useState(
    vehicle.tank_liters != null ? String(vehicle.tank_liters) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError("El nombre no puede estar vacío.");
      return;
    }
    const tankLitersValue = tankLiters.trim() ? Number(tankLiters) : null;
    if (tankLiters.trim() && Number.isNaN(tankLitersValue)) {
      setError("Los litros tienen que ser un número.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase
      .from("vehicles")
      .update({
        name: name.trim(),
        type: type.trim() || null,
        brand: brand.trim() || null,
        model: model.trim() || null,
        license_plate: licensePlate.trim() || null,
        chassis_number: chassisNumber.trim() || null,
        engine_number: engineNumber.trim() || null,
        tank_liters: tankLitersValue,
      })
      .eq("id", vehicle.id);
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
        <h2 className="text-lg font-semibold text-neutral-900">Editar unidad</h2>
        <p className="mb-4 text-sm text-neutral-500">Datos técnicos del vehículo o equipo.</p>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <Field label="Nombre" value={name} onChange={setName} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo" value={type} onChange={setType} placeholder="Ej: Autobomba" />
            <Field label="Dominio (patente)" value={licensePlate} onChange={setLicensePlate} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca" value={brand} onChange={setBrand} />
            <Field label="Modelo" value={model} onChange={setModel} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="N° de chasis" value={chassisNumber} onChange={setChassisNumber} />
            <Field label="N° de motor" value={engineNumber} onChange={setEngineNumber} />
          </div>
          <Field
            label="Litros (capacidad, si corresponde)"
            value={tankLiters}
            onChange={setTankLiters}
            type="number"
            placeholder="Ej: 3000 (tanque de agua)"
          />
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

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-700">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />
    </label>
  );
}
