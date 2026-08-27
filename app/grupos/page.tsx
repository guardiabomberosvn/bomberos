"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";
import type { DispatchGroup, Profile } from "@/lib/types";

function GruposContent() {
  const [groups, setGroups] = useState<DispatchGroup[]>([]);
  const [personal, setPersonal] = useState<Profile[]>([]);
  const [members, setMembers] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: g } = await supabase
      .from("dispatch_groups")
      .select("*")
      .order("name");
    const { data: p } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .order("full_name");
    const { data: m } = await supabase
      .from("dispatch_group_members")
      .select("*");

    const memberMap = new Map<string, Set<string>>();
    (m ?? []).forEach((row) => {
      const set = memberMap.get(row.group_id) ?? new Set<string>();
      set.add(row.profile_id);
      memberMap.set(row.group_id, set);
    });

    setGroups((g as DispatchGroup[]) ?? []);
    setPersonal((p as Profile[]) ?? []);
    setMembers(memberMap);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setError(null);

    // organization_id se completa automático vía el perfil del usuario, pero
    // como la tabla lo exige, lo resolvemos leyendo el propio perfil.
    const { data: userData } = await supabase.auth.getUser();
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userData.user?.id)
      .single();

    const { error: insertError } = await supabase.from("dispatch_groups").insert({
      name: newGroupName.trim(),
      organization_id: myProfile?.organization_id,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setNewGroupName("");
    load();
  };

  const handleToggleActive = async (group: DispatchGroup) => {
    const { error: updateError } = await supabase
      .from("dispatch_groups")
      .update({ is_active: !group.is_active })
      .eq("id", group.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleDeleteGroup = async (group: DispatchGroup) => {
    if (!window.confirm(`¿Eliminar el grupo "${group.name}"?`)) return;
    const { error: deleteError } = await supabase
      .from("dispatch_groups")
      .delete()
      .eq("id", group.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const toggleMember = async (groupId: string, profileId: string) => {
    const isMember = members.get(groupId)?.has(profileId);
    if (isMember) {
      const { error: delError } = await supabase
        .from("dispatch_group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("profile_id", profileId);
      if (delError) setError(delError.message);
    } else {
      const { error: insError } = await supabase
        .from("dispatch_group_members")
        .insert({ group_id: groupId, profile_id: profileId });
      if (insError) setError(insError.message);
    }
    load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        Grupos de convocatoria
      </h1>
      <p className="text-sm text-neutral-500">
        Armá los grupos que después vas a poder convocar desde Emergencias
        (por ejemplo, la guardia de la semana). Un mismo bombero puede estar
        en varios grupos.
      </p>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreateGroup}
        className="flex gap-2 rounded-xl border border-neutral-200 bg-white p-4"
      >
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          placeholder="Nombre del grupo, ej: Grupo 1"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Crear grupo
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
          Todavía no creaste ningún grupo.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const groupMembers = members.get(g.id) ?? new Set();
            const isExpanded = expandedGroup === g.id;
            return (
              <div
                key={g.id}
                className="rounded-xl border border-neutral-200 bg-white"
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    onClick={() =>
                      setExpandedGroup(isExpanded ? null : g.id)
                    }
                    className="flex-1 text-left"
                  >
                    <p className="font-semibold text-neutral-800">
                      {g.name}{" "}
                      <span className="text-sm font-normal text-neutral-500">
                        ({groupMembers.size} integrantes)
                      </span>
                    </p>
                    {!g.is_active && (
                      <span className="text-xs text-neutral-400">
                        Inactivo
                      </span>
                    )}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleActive(g)}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                      {g.is_active ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(g)}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="max-h-64 overflow-y-auto border-t border-neutral-100 p-4">
                    {personal.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 py-1 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={groupMembers.has(p.id)}
                          onChange={() => toggleMember(g.id, p.id)}
                        />
                        {p.full_name}
                      </label>
                    ))}
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

export default function GruposPage() {
  return (
    <ProtectedRoute section="grupos">
      <AppShell>
        <GruposContent />
      </AppShell>
    </ProtectedRoute>
  );
}
