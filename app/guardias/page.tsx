"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";
import type { GuardRosterMember } from "@/lib/types";

function GuardiasContent() {
  const [guards, setGuards] = useState<GuardRosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("guard_roster")
      .select("*")
      .order("name");
    setGuards((data as GuardRosterMember[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("guard-roster-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "guard_roster" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userData.user?.id)
      .single();

    const { error: insertError } = await supabase.from("guard_roster").insert({
      organization_id: myProfile?.organization_id,
      name: name.trim(),
    });

    if (insertError) {
      setError(
        insertError.message.includes("guard_roster_organization_id_name_key")
          ? "Ya hay un guardia cargado con ese nombre."
          : insertError.message
      );
      return;
    }
    setName("");
    load();
  };

  const startEditing = (g: GuardRosterMember) => {
    setEditingId(g.id);
    setEditingName(g.name);
  };

  const confirmRename = async (g: GuardRosterMember) => {
    if (!editingName.trim() || editingName.trim() === g.name) {
      setEditingId(null);
      return;
    }
    const { error: updateError } = await supabase
      .from("guard_roster")
      .update({ name: editingName.trim() })
      .eq("id", g.id);
    if (updateError) {
      setError(
        updateError.message.includes("guard_roster_organization_id_name_key")
          ? "Ya hay un guardia cargado con ese nombre."
          : updateError.message
      );
    }
    setEditingId(null);
    load();
  };

  const handleToggleActive = async (g: GuardRosterMember) => {
    const { error: updateError } = await supabase
      .from("guard_roster")
      .update({ is_active: !g.is_active })
      .eq("id", g.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleDelete = async (g: GuardRosterMember) => {
    if (
      !window.confirm(
        `¿Eliminar a "${g.name}" de la lista de guardias? Los turnos que ya abrió o cerró no se tocan, solo deja de aparecer para elegir en los próximos.`
      )
    )
      return;
    const { error: deleteError } = await supabase.from("guard_roster").delete().eq("id", g.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">Guardias</h1>
      <p className="text-sm text-neutral-500">
        Esta es la lista de nombres que aparece para elegir al abrir o cerrar turno en el
        Libro de Guardia, en vez de escribirlo a mano — así siempre queda igual. Para
        ocultar a alguien que ya no toma guardia, usá &quot;Ocultar&quot; en vez de
        eliminarlo, así no se pierde su historial.
      </p>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap gap-2 rounded-xl border border-neutral-200 bg-white p-4"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre y apellido"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Agregar guardia
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : guards.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
          Todavía no hay guardias cargados.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {guards.map((g) => (
                <tr key={g.id}>
                  <td className="px-4 py-2 font-medium text-neutral-800">
                    {editingId === g.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => confirmRename(g)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            confirmRename(g);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="w-full rounded-md border border-neutral-300 px-2 py-1"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditing(g)}
                        className="hover:underline"
                        title="Tocar para renombrar"
                      >
                        {g.name}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    {g.is_active ? "Activo" : "Oculto"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleActive(g)}
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        {g.is_active ? "Ocultar" : "Mostrar"}
                      </button>
                      <button
                        onClick={() => handleDelete(g)}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function GuardiasPage() {
  return (
    <ProtectedRoute section="guardias">
      <AppShell>
        <GuardiasContent />
      </AppShell>
    </ProtectedRoute>
  );
}
