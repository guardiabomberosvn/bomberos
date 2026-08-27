"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EmergencyType, EmergencyTypeMotive } from "@/lib/types";

const COLOR_OPTIONS = [
  "#b91c1c",
  "#c2410c",
  "#a16207",
  "#15803d",
  "#0369a1",
  "#6d28d9",
  "#334155",
];

export function ManageEmergencyTypesModal({
  types,
  organizationId,
  onClose,
  onChanged,
}: {
  types: EmergencyType[];
  organizationId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [icon, setIcon] = useState("🔥");
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Motivos (segundo nivel de botones, ej: dentro de "Incendio" → Casa,
  // Auto, Campo...). Se cargan solo para el tipo que se está expandiendo.
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const [motives, setMotives] = useState<EmergencyTypeMotive[]>([]);
  const [loadingMotives, setLoadingMotives] = useState(false);
  const [motiveName, setMotiveName] = useState("");
  const [motiveCode, setMotiveCode] = useState("");

  const loadMotives = async (typeId: string) => {
    setLoadingMotives(true);
    const { data } = await supabase
      .from("emergency_type_motives")
      .select("*")
      .eq("emergency_type_id", typeId)
      .order("sort_order");
    setMotives((data as EmergencyTypeMotive[]) ?? []);
    setLoadingMotives(false);
  };

  useEffect(() => {
    if (expandedTypeId) loadMotives(expandedTypeId);
  }, [expandedTypeId]);

  const toggleExpanded = (typeId: string) => {
    setMotiveName("");
    setMotiveCode("");
    setExpandedTypeId((current) => (current === typeId ? null : typeId));
  };

  const handleAddMotive = async (e: React.FormEvent, typeId: string) => {
    e.preventDefault();
    if (!motiveName.trim()) return;
    const { error: insertError } = await supabase.from("emergency_type_motives").insert({
      emergency_type_id: typeId,
      name: motiveName.trim(),
      code: motiveCode.trim() || null,
      sort_order: motives.length,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setMotiveName("");
    setMotiveCode("");
    loadMotives(typeId);
  };

  const handleToggleMotiveActive = async (motive: EmergencyTypeMotive) => {
    const { error: updateError } = await supabase
      .from("emergency_type_motives")
      .update({ is_active: !motive.is_active })
      .eq("id", motive.id);
    if (updateError) setError(updateError.message);
    loadMotives(motive.emergency_type_id);
  };

  const handleDeleteMotive = async (motive: EmergencyTypeMotive) => {
    if (!window.confirm(`¿Eliminar el motivo "${motive.name}"?`)) return;
    const { error: deleteError } = await supabase
      .from("emergency_type_motives")
      .delete()
      .eq("id", motive.id);
    if (deleteError) setError(deleteError.message);
    loadMotives(motive.emergency_type_id);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSaving(true);

    const { error: insertError } = await supabase.from("emergency_types").insert({
      organization_id: organizationId,
      name: name.trim(),
      code: code.trim() || null,
      icon,
      color,
      sort_order: types.length,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setName("");
    setCode("");
    onChanged();
  };

  const handleToggleActive = async (type: EmergencyType) => {
    const { error: updateError } = await supabase
      .from("emergency_types")
      .update({ is_active: !type.is_active })
      .eq("id", type.id);
    if (updateError) setError(updateError.message);
    onChanged();
  };

  const handleDelete = async (type: EmergencyType) => {
    if (!window.confirm(`¿Eliminar el botón "${type.name}"?`)) return;
    const { error: deleteError } = await supabase
      .from("emergency_types")
      .delete()
      .eq("id", type.id);
    if (deleteError) setError(deleteError.message);
    onChanged();
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">
            Botones de emergencia
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            Cerrar
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form
          onSubmit={handleAdd}
          className="mb-5 space-y-2 rounded-lg border border-neutral-200 p-3"
        >
          <p className="text-sm font-medium text-neutral-700">
            Nuevo botón
          </p>
          <div className="flex gap-2">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🔥"
              className="w-14 rounded-md border border-neutral-300 px-2 py-2 text-center text-lg"
              maxLength={2}
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre, ej: Incendio Estructural"
              required
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código del tipo, ej: 01 (opcional)"
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
          <div className="flex gap-1">
            {COLOR_OPTIONS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className="h-7 w-7 rounded-full border-2"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? "#111" : "transparent",
                }}
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {saving ? "Agregando…" : "+ Agregar botón"}
          </button>
        </form>

        <div className="space-y-2">
          {types.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Todavía no creaste ningún botón.
            </p>
          ) : (
            types.map((t) => (
              <div key={t.id} className="rounded-lg border border-neutral-200 px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: t.color }}
                    >
                      {t.icon}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-neutral-800">
                        {t.name}
                      </p>
                      {t.code && (
                        <p className="text-xs text-neutral-500">{t.code}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleExpanded(t.id)}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                      {expandedTypeId === t.id ? "Ocultar motivos" : "Motivos"}
                    </button>
                    <button
                      onClick={() => handleToggleActive(t)}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                      {t.is_active ? "Ocultar" : "Mostrar"}
                    </button>
                    <button
                      onClick={() => handleDelete(t)}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                {expandedTypeId === t.id && (
                  <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
                    <p className="text-xs text-neutral-500">
                      Botones de &quot;¿de qué es?&quot; para {t.name} — se pueden agregar los que
                      hagan falta (ej: Casa, Auto, Campo…).
                    </p>
                    {loadingMotives ? (
                      <p className="text-xs text-neutral-400">Cargando…</p>
                    ) : motives.length === 0 ? (
                      <p className="text-xs text-neutral-400">Todavía no hay motivos para este tipo.</p>
                    ) : (
                      <ul className="divide-y divide-neutral-100">
                        {motives.map((m) => (
                          <li key={m.id} className="flex items-center justify-between py-1.5 text-sm">
                            <span className={m.is_active ? "" : "text-neutral-400 line-through"}>
                              {m.name}
                              {m.code ? ` (${m.code})` : ""}
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleToggleMotiveActive(m)}
                                className="text-xs font-medium text-neutral-500 hover:text-neutral-800"
                              >
                                {m.is_active ? "Ocultar" : "Mostrar"}
                              </button>
                              <button
                                onClick={() => handleDeleteMotive(m)}
                                className="text-xs font-medium text-red-700 hover:underline"
                              >
                                Eliminar
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <form
                      onSubmit={(e) => handleAddMotive(e, t.id)}
                      className="flex flex-wrap gap-2 pt-1"
                    >
                      <input
                        value={motiveName}
                        onChange={(e) => setMotiveName(e.target.value)}
                        placeholder="Nombre, ej: Casa"
                        required
                        className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      />
                      <input
                        value={motiveCode}
                        onChange={(e) => setMotiveCode(e.target.value)}
                        placeholder="Código, ej: 101"
                        className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      />
                      <button
                        type="submit"
                        className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark"
                      >
                        + Agregar
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
