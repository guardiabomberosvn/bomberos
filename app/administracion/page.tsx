"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";
import { hasSectionAccess, SECTIONS, type SectionKey } from "@/lib/permissions";

function AdministracionContent() {
  const { profile: myProfile } = useAuth();
  const [personal, setPersonal] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<SectionKey>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    setPersonal((data as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const startEditing = (person: Profile) => {
    // Arranca con lo que esa persona ya tiene habilitado hoy (personalizado
    // o por defecto de su rol), así "Personalizar" no le saca accesos de
    // golpe — el admin edita desde ahí.
    const current = new Set<SectionKey>(
      SECTIONS.filter((s) => hasSectionAccess(person, s.key)).map((s) => s.key)
    );
    setDraft(current);
    setEditingId(person.id);
    setError(null);
  };

  const toggleDraftSection = (key: SectionKey) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const saveDraft = async () => {
    if (!editingId) return;
    setSaving(true);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ allowed_sections: Array.from(draft) })
      .eq("id", editingId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditingId(null);
    load();
  };

  const resetToRoleDefault = async (person: Profile) => {
    if (
      !window.confirm(
        `¿Restablecer los accesos de ${person.full_name} a los valores por defecto de su rol (${ROLE_LABELS[person.role]})? Se borra cualquier personalización.`
      )
    )
      return;
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ allowed_sections: null })
      .eq("id", person.id);
    if (updateError) setError(updateError.message);
    if (editingId === person.id) setEditingId(null);
    load();
  };

  const operacionSections = SECTIONS.filter((s) => s.group === "operacion");
  const configuracionSections = SECTIONS.filter((s) => s.group === "configuracion");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Administración</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Elegí, persona por persona, a qué secciones del sistema puede entrar —
          incluidas las que hoy figuran como Administrador. Mientras no
          personalices a alguien, sigue viendo lo de siempre según su rol.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : (
        <div className="space-y-3">
          {personal.map((person) => {
            const isAdmin = person.role === "admin";
            const isEditing = editingId === person.id;
            const isCustomized = person.allowed_sections != null;
            const isMe = person.id === myProfile?.id;

            return (
              <div key={person.id} className="rounded-xl border border-neutral-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <p className="font-semibold text-neutral-800">
                      {person.full_name}
                      {isMe && <span className="ml-1 text-xs font-normal text-neutral-400">(vos)</span>}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {ROLE_LABELS[person.role]}
                      {!person.is_active ? " · Inactivo" : ""}
                      {isCustomized
                        ? " · Accesos personalizados"
                        : isAdmin
                        ? " · Acceso total a todo el sistema (por defecto de su rol)"
                        : " · Accesos por defecto de su rol"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {isCustomized && (
                      <button
                        onClick={() => resetToRoleDefault(person)}
                        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        Restablecer al rol
                      </button>
                    )}
                    <button
                      onClick={() => (isEditing ? setEditingId(null) : startEditing(person))}
                      className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark"
                    >
                      {isEditing ? "Cerrar" : "Personalizar accesos"}
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="space-y-4 border-t border-neutral-100 px-4 py-4">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                        Operación
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {operacionSections.map((s) => (
                          <label key={s.key} className="flex items-center gap-2 text-sm text-neutral-700">
                            <input
                              type="checkbox"
                              checked={draft.has(s.key)}
                              onChange={() => toggleDraftSection(s.key)}
                            />
                            <span>{s.icon} {s.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                        Configuración
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {configuracionSections.map((s) => (
                          <label key={s.key} className="flex items-center gap-2 text-sm text-neutral-700">
                            <input
                              type="checkbox"
                              checked={draft.has(s.key)}
                              onChange={() => toggleDraftSection(s.key)}
                            />
                            <span>{s.icon} {s.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={saveDraft}
                        disabled={saving}
                        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
                      >
                        {saving ? "Guardando…" : "Guardar accesos"}
                      </button>
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

export default function AdministracionPage() {
  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <AppShell>
        <AdministracionContent />
      </AppShell>
    </ProtectedRoute>
  );
}
