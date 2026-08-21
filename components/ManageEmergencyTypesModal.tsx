"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EmergencyType } from "@/lib/types";

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
            placeholder="Código, ej: 01-101 (opcional)"
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
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2"
              >
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
