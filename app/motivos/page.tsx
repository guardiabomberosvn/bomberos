"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";
import type { AttendanceReason } from "@/lib/types";

function MotivosContent() {
  const [reasons, setReasons] = useState<AttendanceReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [points, setPoints] = useState("1");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("attendance_reasons")
      .select("*")
      .order("sort_order");
    setReasons((data as AttendanceReason[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
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

    const { error: insertError } = await supabase.from("attendance_reasons").insert({
      organization_id: myProfile?.organization_id,
      name: name.trim(),
      points: Number(points) || 0,
      sort_order: reasons.length,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setName("");
    setPoints("1");
    load();
  };

  const handleUpdatePoints = async (reason: AttendanceReason, newPoints: string) => {
    const value = Number(newPoints);
    if (Number.isNaN(value)) return;
    const { error: updateError } = await supabase
      .from("attendance_reasons")
      .update({ points: value })
      .eq("id", reason.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleToggleActive = async (reason: AttendanceReason) => {
    const { error: updateError } = await supabase
      .from("attendance_reasons")
      .update({ is_active: !reason.is_active })
      .eq("id", reason.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleDelete = async (reason: AttendanceReason) => {
    if (!window.confirm(`¿Eliminar el motivo "${reason.name}"?`)) return;
    const { error: deleteError } = await supabase
      .from("attendance_reasons")
      .delete()
      .eq("id", reason.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        Motivos de asistencia
      </h1>
      <p className="text-sm text-neutral-500">
        Al marcar ingreso, cada bombero elige uno de estos motivos. Cada
        motivo tiene un puntaje que se acumula en el resumen mensual.
      </p>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap gap-2 rounded-xl border border-neutral-200 bg-white p-4"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre, ej: Guardia"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <input
          type="number"
          step="0.5"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          placeholder="Puntos"
          className="w-24 rounded-md border border-neutral-300 px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Crear motivo
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : reasons.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
          Todavía no hay motivos creados.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Motivo</th>
                <th className="px-4 py-2 font-medium">Puntos</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {reasons.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-medium text-neutral-800">
                    {r.name}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.5"
                      defaultValue={r.points}
                      onBlur={(e) => handleUpdatePoints(r, e.target.value)}
                      className="w-20 rounded-md border border-neutral-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    {r.is_active ? "Activo" : "Inactivo"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleActive(r)}
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        {r.is_active ? "Ocultar" : "Mostrar"}
                      </button>
                      <button
                        onClick={() => handleDelete(r)}
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

export default function MotivosPage() {
  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <AppShell>
        <MotivosContent />
      </AppShell>
    </ProtectedRoute>
  );
}
