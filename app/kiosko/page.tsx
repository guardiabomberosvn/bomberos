"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import type { AttendanceReason } from "@/lib/types";

type Step = "legajo" | "found" | "working" | "success" | "error";

interface FoundPerson {
  id: string;
  full_name: string;
  hasOpenRecord: boolean;
}

function KioskoContent() {
  const { profile } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<Step>("legajo");
  const [legajo, setLegajo] = useState("");
  const [person, setPerson] = useState<FoundPerson | null>(null);
  const [reasons, setReasons] = useState<AttendanceReason[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase
      .from("attendance_reasons")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setReasons((data as AttendanceReason[]) ?? []));
  }, []);

  useEffect(() => {
    if (step === "legajo") inputRef.current?.focus();
  }, [step]);

  const reset = () => {
    setStep("legajo");
    setLegajo("");
    setPerson(null);
    setSelectedReasonId("");
    setMessage("");
  };

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLegajo = legajo.trim();
    if (!cleanLegajo || !profile) return;

    setMessage("");
    const { data: found } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("organization_id", profile.organization_id)
      .eq("legajo", cleanLegajo)
      .eq("is_active", true)
      .maybeSingle();

    if (!found) {
      setStep("error");
      setMessage("No hay nadie activo con ese número de legajo. Revisalo y probá de nuevo.");
      return;
    }

    const { data: open } = await supabase
      .from("attendance")
      .select("id")
      .eq("firefighter_id", found.id)
      .is("checked_out_at", null)
      .maybeSingle();

    setPerson({ id: found.id, full_name: found.full_name, hasOpenRecord: !!open });
    setSelectedReasonId("");
    setStep("found");
  };

  const handleConfirm = async () => {
    if (!person) return;
    if (!person.hasOpenRecord && !selectedReasonId) {
      setMessage("Elegí un motivo antes de confirmar.");
      return;
    }
    setStep("working");
    setMessage("");

    const { data, error } = await supabase.rpc("checkin_with_legajo", {
      p_legajo: legajo.trim(),
      p_reason_id: person.hasOpenRecord ? null : selectedReasonId || null,
    });

    if (error) {
      setStep("error");
      setMessage(error.message || "No se pudo registrar. Probá de nuevo.");
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const action = result?.action === "ingreso" ? "Ingreso" : "Salida";
    setMessage(`${action} registrado — ${result?.firefighter_name ?? person.full_name}`);
    setStep("success");
    setTimeout(reset, 3000);
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-neutral-900">Registrar asistencia</h1>

        {step === "legajo" && (
          <form onSubmit={handleBuscar} className="space-y-4">
            <p className="text-sm text-neutral-500">Escribí tu número de legajo</p>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={legajo}
              onChange={(e) => setLegajo(e.target.value)}
              placeholder="Legajo"
              className="w-full rounded-lg border border-neutral-300 px-4 py-4 text-center text-3xl tracking-widest"
            />
            <button
              type="submit"
              disabled={!legajo.trim()}
              className="w-full rounded-lg bg-brand px-4 py-3 text-lg font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              Buscar
            </button>
          </form>
        )}

        {step === "found" && person && (
          <div className="space-y-4">
            <p className="text-2xl font-bold text-neutral-900">{person.full_name}</p>
            {person.hasOpenRecord ? (
              <p className="rounded-md bg-neutral-100 px-3 py-3 text-sm text-neutral-700">
                Ya tenés un ingreso registrado — esto va a marcar tu{" "}
                <strong>salida</strong>.
              </p>
            ) : (
              <label className="block text-left text-sm">
                <span className="mb-1 block font-medium text-neutral-700">
                  Motivo del ingreso
                </span>
                <select
                  value={selectedReasonId}
                  onChange={(e) => setSelectedReasonId(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-3 text-base"
                >
                  <option value="">Elegí un motivo…</option>
                  {reasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {message && <p className="text-sm text-red-600">{message}</p>}
            <div className="flex gap-2">
              <button
                onClick={reset}
                className="flex-1 rounded-lg border border-neutral-300 px-4 py-3 font-medium text-neutral-700 hover:bg-neutral-100"
              >
                No soy yo
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 rounded-lg bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark"
              >
                {person.hasOpenRecord ? "Confirmar salida" : "Confirmar ingreso"}
              </button>
            </div>
          </div>
        )}

        {step === "working" && <p className="text-neutral-500">Registrando…</p>}

        {step === "success" && (
          <div className="space-y-3">
            <p className="text-4xl">✅</p>
            <p className="font-medium text-neutral-800">{message}</p>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4">
            <p className="text-4xl">⚠️</p>
            <p className="text-sm text-neutral-700">{message}</p>
            <button
              onClick={reset}
              className="w-full rounded-lg bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KioskoPage() {
  return (
    <ProtectedRoute section="kiosko">
      <AppShell>
        <KioskoContent />
      </AppShell>
    </ProtectedRoute>
  );
}
