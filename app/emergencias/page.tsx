"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { DispatchModal } from "@/components/DispatchModal";
import { ManageEmergencyTypesModal } from "@/components/ManageEmergencyTypesModal";
import { EmergencySiren } from "@/components/EmergencySiren";
import { supabase } from "@/lib/supabase";
import { exportToExcel } from "@/lib/export";
import type {
  DispatchGroup,
  Emergency,
  EmergencyResponse,
  EmergencyType,
  Profile,
} from "@/lib/types";
import { EMERGENCY_STATUS_LABELS } from "@/lib/types";

function EmergenciasContent() {
  const { profile } = useAuth();
  const isStaff = profile?.role === "admin" || profile?.role === "guardia";
  const isAdmin = profile?.role === "admin";

  const [types, setTypes] = useState<EmergencyType[]>([]);
  const [groups, setGroups] = useState<DispatchGroup[]>([]);
  const [personal, setPersonal] = useState<Profile[]>([]);
  const [creatorNames, setCreatorNames] = useState<Map<string, string>>(new Map());
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [responses, setResponses] = useState<EmergencyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dispatchType, setDispatchType] = useState<EmergencyType | null>(null);
  const [showManageTypes, setShowManageTypes] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: t } = await supabase
      .from("emergency_types")
      .select("*")
      .order("sort_order");
    const { data: g } = await supabase
      .from("dispatch_groups")
      .select("*")
      .eq("is_active", true)
      .order("name");
    const { data: em } = await supabase
      .from("emergencies")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    const { data: resp } = await supabase.from("emergency_responses").select("*");

    // Nombres de quien creó cada alerta — todos pueden ver esto, no solo staff.
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, full_name");
    setCreatorNames(
      new Map(((allProfiles as { id: string; full_name: string }[]) ?? []).map((p) => [p.id, p.full_name]))
    );

    if (isStaff) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("is_active", true)
        .order("full_name");
      setPersonal((prof as Profile[]) ?? []);
    }

    setTypes((t as EmergencyType[]) ?? []);
    setGroups((g as DispatchGroup[]) ?? []);
    setEmergencies((em as Emergency[]) ?? []);
    setResponses((resp as EmergencyResponse[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useEffect(() => {
    const channel = supabase
      .channel("emergencias-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "emergencies" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency_responses" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency_types" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTypes = types.filter((t) => t.is_active);
  const activeEmergencies = emergencies.filter((e) => e.status === "activa");
  const pastEmergencies = emergencies.filter((e) => e.status !== "activa");

  const handleCancel = async (emergency: Emergency) => {
    const reason = window.prompt("Motivo para cancelar la alerta:");
    if (reason === null) return;
    const { error: updateError } = await supabase
      .from("emergencies")
      .update({
        status: "cancelada",
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason || null,
      })
      .eq("id", emergency.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleFinish = async (emergency: Emergency) => {
    const { error: updateError } = await supabase
      .from("emergencies")
      .update({ status: "finalizada" })
      .eq("id", emergency.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleRespond = async (emergency: Emergency, value: "acudo" | "no_acudo") => {
    if (!profile) return;
    const { error: upsertError } = await supabase.from("emergency_responses").upsert(
      {
        emergency_id: emergency.id,
        profile_id: profile.id,
        response: value,
        responded_at: new Date().toISOString(),
      },
      { onConflict: "emergency_id,profile_id" }
    );
    if (upsertError) setError(upsertError.message);
    load();
  };

  const myResponseFor = (emergencyId: string) =>
    responses.find((r) => r.emergency_id === emergencyId && r.profile_id === profile?.id);

  const countsFor = (emergencyId: string) => {
    const rs = responses.filter((r) => r.emergency_id === emergencyId);
    return {
      acudo: rs.filter((r) => r.response === "acudo").length,
      no_acudo: rs.filter((r) => r.response === "no_acudo").length,
    };
  };

  // Lista de nombres (no solo el conteo) para que el operador vea quién
  // viene hacia el cuartel. Se ordena por hora de respuesta.
  const respondersFor = (emergencyId: string) => {
    const rs = [...responses]
      .filter((r) => r.emergency_id === emergencyId)
      .sort((a, b) => new Date(a.responded_at).getTime() - new Date(b.responded_at).getTime());
    return {
      acudo: rs.filter((r) => r.response === "acudo").map((r) => creatorNames.get(r.profile_id) ?? "—"),
      no_acudo: rs.filter((r) => r.response === "no_acudo").map((r) => creatorNames.get(r.profile_id) ?? "—"),
    };
  };

  const handleExportHistory = () => {
    const data = emergencies.map((em) => {
      const counts = countsFor(em.id);
      return {
        Título: em.title,
        Estado: EMERGENCY_STATUS_LABELS[em.status],
        "Accionada por": creatorNames.get(em.created_by) ?? "—",
        Fecha: new Date(em.created_at).toLocaleString("es-AR"),
        Dirección: em.address ?? "",
        Acuden: counts.acudo,
        "No acuden": counts.no_acudo,
      };
    });
    exportToExcel(data, "emergencias", "Emergencias");
  };

  return (
    <div className="space-y-6">
      <EmergencySiren emergencies={activeEmergencies} myProfileId={profile?.id} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Emergencias</h1>
        {isAdmin && (
          <button
            onClick={() => setShowManageTypes(true)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            ⚙ Configurar botones
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {isStaff && (
        <div>
          {activeTypes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500">
              Todavía no configuraste ningún botón de emergencia.{" "}
              {isAdmin && (
                <button
                  onClick={() => setShowManageTypes(true)}
                  className="font-medium text-brand hover:underline"
                >
                  Crear el primero
                </button>
              )}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {activeTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDispatchType(t)}
                  className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-white p-4 text-center shadow-sm transition hover:shadow-md active:scale-95"
                >
                  <span
                    className="flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white"
                    style={{ backgroundColor: t.color }}
                  >
                    {t.icon}
                  </span>
                  <span className="text-sm font-semibold text-neutral-800">
                    {t.name}
                  </span>
                  {t.code && (
                    <span className="text-xs text-neutral-500">{t.code}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">
          Activas
        </h2>
        {loading ? (
          <p className="text-sm text-neutral-500">Cargando…</p>
        ) : activeEmergencies.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
            No hay emergencias activas.
          </p>
        ) : (
          activeEmergencies.map((em) => {
            const myResp = myResponseFor(em.id);
            const counts = countsFor(em.id);
            return (
              <div
                key={em.id}
                className="rounded-xl border-2 border-brand bg-brand-light p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-brand-dark">{em.title}</p>
                    {em.address && (
                      <p className="text-sm text-neutral-700">{em.address}</p>
                    )}
                    {em.notes && (
                      <p className="mt-1 text-sm text-neutral-600">{em.notes}</p>
                    )}
                    <p className="mt-1 text-xs text-neutral-500">
                      {new Date(em.created_at).toLocaleString("es-AR")}
                      {" · Accionada por "}
                      <span className="font-medium">
                        {creatorNames.get(em.created_by) ?? "—"}
                      </span>
                    </p>
                  </div>
                  {isStaff && (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleFinish(em)}
                        className="rounded-md border border-neutral-400 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        Finalizar
                      </button>
                      <button
                        onClick={() => handleCancel(em)}
                        className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Detener alerta
                      </button>
                    </div>
                  )}
                </div>

                {!isStaff && em.needs_response && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleRespond(em, "acudo")}
                      className={`flex-1 rounded-md py-2 text-sm font-semibold ${
                        myResp?.response === "acudo"
                          ? "bg-emerald-600 text-white"
                          : "border border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                      }`}
                    >
                      ✅ ACUDO
                    </button>
                    <button
                      onClick={() => handleRespond(em, "no_acudo")}
                      className={`flex-1 rounded-md py-2 text-sm font-semibold ${
                        myResp?.response === "no_acudo"
                          ? "bg-neutral-700 text-white"
                          : "border border-neutral-400 text-neutral-700 hover:bg-neutral-100"
                      }`}
                    >
                      ✖ NO ACUDO
                    </button>
                  </div>
                )}
                {!isStaff && !em.needs_response && (
                  <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
                    Aviso informativo — no requiere respuesta.
                  </p>
                )}

                {isStaff && em.needs_response && (
                  <div className="mt-3">
                    <p className="text-sm text-neutral-700">
                      <span className="font-medium text-emerald-700">
                        {counts.acudo} acuden
                      </span>
                      {" · "}
                      <span className="font-medium text-neutral-600">
                        {counts.no_acudo} no acuden
                      </span>
                    </p>
                    {(counts.acudo > 0 || counts.no_acudo > 0) && (
                      <div className="mt-2 space-y-1 rounded-md bg-white/60 px-3 py-2 text-xs">
                        {counts.acudo > 0 && (
                          <p className="text-emerald-700">
                            <span className="font-semibold">✅ Acuden:</span>{" "}
                            {respondersFor(em.id).acudo.join(", ")}
                          </p>
                        )}
                        {counts.no_acudo > 0 && (
                          <p className="text-neutral-600">
                            <span className="font-semibold">✖ No acuden:</span>{" "}
                            {respondersFor(em.id).no_acudo.join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {isStaff && !em.needs_response && (
                  <p className="mt-3 text-xs text-neutral-400">
                    Aviso informativo, sin convocatoria.
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {pastEmergencies.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase text-neutral-500">
              Historial
            </h2>
            <button
              onClick={handleExportHistory}
              className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
            >
              📥 Exportar Excel
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Título</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="px-4 py-2 font-medium">Accionada por</th>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pastEmergencies.map((em) => (
                  <tr key={em.id}>
                    <td className="px-4 py-2 text-neutral-800">{em.title}</td>
                    <td className="px-4 py-2 text-neutral-600">
                      {EMERGENCY_STATUS_LABELS[em.status]}
                    </td>
                    <td className="px-4 py-2 text-neutral-600">
                      {creatorNames.get(em.created_by) ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-neutral-500">
                      {new Date(em.created_at).toLocaleString("es-AR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dispatchType && profile && (
        <DispatchModal
          type={dispatchType}
          organizationId={profile.organization_id}
          createdBy={profile.id}
          groups={groups}
          personal={personal}
          onClose={() => setDispatchType(null)}
          onDispatched={() => {
            setDispatchType(null);
            load();
          }}
        />
      )}

      {showManageTypes && profile && (
        <ManageEmergencyTypesModal
          types={types}
          organizationId={profile.organization_id}
          onClose={() => setShowManageTypes(false)}
          onChanged={load}
        />
      )}
    </div>
  );
}

export default function EmergenciasPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <EmergenciasContent />
      </AppShell>
    </ProtectedRoute>
  );
}
