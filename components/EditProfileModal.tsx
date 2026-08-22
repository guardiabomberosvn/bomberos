"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile, Role } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";

export function EditProfileModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [legajo, setLegajo] = useState(profile.legajo ?? "");
  const [rank, setRank] = useState(profile.rank ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [role, setRole] = useState<Role>(profile.role);
  const [isActive, setIsActive] = useState(profile.is_active);
  const [notifyMaintenance, setNotifyMaintenance] = useState(profile.notify_maintenance);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!fullName.trim()) {
      setError("El nombre no puede estar vacío.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        legajo: legajo.trim() || null,
        rank: rank.trim() || null,
        phone: phone.trim() || null,
        role,
        is_active: isActive,
        notify_maintenance: notifyMaintenance,
      })
      .eq("id", profile.id);
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
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-neutral-900">
          Editar personal
        </h2>
        <p className="mb-4 text-sm text-neutral-500">{profile.email}</p>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <Field label="Nombre completo" value={fullName} onChange={setFullName} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Legajo" value={legajo} onChange={setLegajo} />
            <Field label="Rango" value={rank} onChange={setRank} />
          </div>
          <Field label="Teléfono" value={phone} onChange={setPhone} />

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Rol</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            >
              {(["admin", "guardia", "bombero"] as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span className="font-medium text-neutral-700">
              Personal activo
            </span>
          </label>

          <label className="flex items-start gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={notifyMaintenance}
              onChange={(e) => setNotifyMaintenance(e.target.checked)}
            />
            <span>
              <span className="font-medium text-neutral-700">
                Recibe alertas de mantenimiento por Telegram
              </span>
              <span className="block text-xs text-neutral-500">
                Le llega un aviso cuando alguien reporta un hallazgo o cuando
                un service entra en 🟠 muy próximo / 🔴 vencido (requiere
                tener Telegram vinculado en "Mi cuenta").
              </span>
            </span>
          </label>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-700">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />
    </label>
  );
}
