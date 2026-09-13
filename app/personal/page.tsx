"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { EditProfileModal } from "@/components/EditProfileModal";
import { supabase } from "@/lib/supabase";
import type { AttendanceReason, Profile } from "@/lib/types";
import { AVAILABILITY_LABELS, ROLE_LABELS } from "@/lib/types";

function PersonalContent() {
  const { profile: myProfile } = useAuth();
  const [personal, setPersonal] = useState<Profile[]>([]);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<AttendanceReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [reasonPromptFor, setReasonPromptFor] = useState<Profile | null>(null);
  const [selectedReasonId, setSelectedReasonId] = useState("");

  const isAdmin = myProfile?.role === "admin";
  const canMarkForOthers = myProfile?.role === "admin";

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name");

    const { data: open } = await supabase
      .from("attendance")
      .select("firefighter_id")
      .is("checked_out_at", null);

    const { data: reasonsData } = await supabase
      .from("attendance_reasons")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");

    setPersonal((data as Profile[]) ?? []);
    setOpenIds(new Set((open ?? []).map((a) => a.firefighter_id as string)));
    setReasons((reasonsData as AttendanceReason[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleAttendanceForOther = async (person: Profile) => {
    if (!myProfile) return;

    // Si va a marcar ingreso (no está presente todavía), pedimos motivo primero.
    if (!openIds.has(person.id)) {
      setSelectedReasonId("");
      setReasonPromptFor(person);
      return;
    }

    setError(null);
    setMarkingId(person.id);

    const { data: openRecord } = await supabase
      .from("attendance")
      .select("id")
      .eq("firefighter_id", person.id)
      .is("checked_out_at", null)
      .maybeSingle();

    if (openRecord) {
      const { error: updateError } = await supabase
        .from("attendance")
        .update({ checked_out_at: new Date().toISOString() })
        .eq("id", openRecord.id);
      if (updateError) setError(updateError.message);
    }

    setMarkingId(null);
    load();
  };

  const confirmCheckInWithReason = async () => {
    if (!myProfile || !reasonPromptFor) return;
    if (!selectedReasonId) {
      setError("Elegí un motivo antes de confirmar.");
      return;
    }
    setError(null);
    setMarkingId(reasonPromptFor.id);

    const { error: insertError } = await supabase.from("attendance").insert({
      organization_id: reasonPromptFor.organization_id,
      firefighter_id: reasonPromptFor.id,
      type: "cuartel",
      notes: `Registrado manualmente por ${myProfile.full_name}`,
      reason_id: selectedReasonId,
    });
    if (insertError) setError(insertError.message);

    setMarkingId(null);
    setReasonPromptFor(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-neutral-900">Personal</h1>
        {!isAdmin && (
          <span className="text-sm text-neutral-500">
            Solo lectura — pedile a un administrador que edite datos
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Legajo</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Disponibilidad</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Cargando…
                </td>
              </tr>
            ) : (
              personal.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-800">{p.full_name}</p>
                    <p className="text-xs text-neutral-500">
                      {p.email}
                      {p.rank ? ` · ${p.rank}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {p.legajo ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {ROLE_LABELS[p.role]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        p.availability === "disponible"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {AVAILABILITY_LABELS[p.availability]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-neutral-600">
                        {p.is_active ? "Activo" : "Inactivo"}
                      </span>
                      {openIds.has(p.id) && (
                        <span className="w-fit rounded-full bg-brand-light px-2 py-0.5 text-xs font-medium text-brand-dark">
                          En el cuartel
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {isAdmin && (
                        <button
                          onClick={() => setEditing(p)}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          Editar
                        </button>
                      )}
                      {canMarkForOthers && p.id !== myProfile?.id && (
                        <button
                          onClick={() => toggleAttendanceForOther(p)}
                          disabled={markingId === p.id}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
                        >
                          {markingId === p.id
                            ? "…"
                            : openIds.has(p.id)
                            ? "Marcar salida"
                            : "Marcar ingreso"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditProfileModal
          profile={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {reasonPromptFor && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setReasonPromptFor(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold text-neutral-900">
              Marcar ingreso
            </h2>
            <p className="mb-4 text-sm text-neutral-500">
              {reasonPromptFor.full_name}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">
                Motivo
              </span>
              <select
                value={selectedReasonId}
                onChange={(e) => setSelectedReasonId(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              >
                <option value="">Elegí un motivo…</option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setReasonPromptFor(null)}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                onClick={confirmCheckInWithReason}
                disabled={markingId === reasonPromptFor.id}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
              >
                Confirmar ingreso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PersonalPage() {
  return (
    <ProtectedRoute section="personal">
      <AppShell>
        <PersonalContent />
      </AppShell>
    </ProtectedRoute>
  );
}
