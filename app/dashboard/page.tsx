"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmergencySiren } from "@/components/EmergencySiren";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { checkAndNotifyVehicleServiceDueDates, getVehicleServiceAlertLevel } from "@/lib/maintenance";
import type { Emergency, Profile, Vehicle } from "@/lib/types";

function DashboardContent() {
  const { profile } = useAuth();
  const isStaff = profile?.role === "admin" || profile?.role === "guardia";
  const [personal, setPersonal] = useState<Profile[]>([]);
  const [presentesIds, setPresentesIds] = useState<Set<string>>(new Set());
  const [activeEmergencies, setActiveEmergencies] = useState<Emergency[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    const load = async () => {
      setLoading(true);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name");

      const { data: openAttendance } = await supabase
        .from("attendance")
        .select("firefighter_id")
        .is("checked_out_at", null);

      const { data: emergencies } = await supabase
        .from("emergencies")
        .select("*")
        .eq("status", "activa")
        .order("created_at", { ascending: false });

      if (isStaff) {
        const { data: v } = await supabase.from("vehicles").select("*");
        const vehicleList = (v as Vehicle[]) ?? [];
        setVehicles(vehicleList);
        // Avisa por Telegram a los contactos configurados cuando el próximo
        // service de una unidad acaba de entrar en alerta. No bloqueamos el
        // dashboard por esto.
        checkAndNotifyVehicleServiceDueDates(profile.organization_id, vehicleList);
      }

      setPersonal((profiles as Profile[]) ?? []);
      setPresentesIds(
        new Set((openAttendance ?? []).map((a) => a.firefighter_id as string))
      );
      setActiveEmergencies((emergencies as Emergency[]) ?? []);
      setLoading(false);
    };

    load();

    const profilesChannel = supabase
      .channel("dashboard-profiles")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => load()
      )
      .subscribe();

    const attendanceChannel = supabase
      .channel("dashboard-attendance")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance" },
        () => load()
      )
      .subscribe();

    const emergenciesChannel = supabase
      .channel("dashboard-emergencies")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emergencies" },
        () => load()
      )
      .subscribe();

    const maintenanceChannel = supabase
      .channel("dashboard-maintenance")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "maintenance_records" },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(emergenciesChannel);
      supabase.removeChannel(maintenanceChannel);
    };
  }, [profile, isStaff]);

  const activos = personal.filter((p) => p.is_active);
  const disponibles = activos.filter((p) => p.availability === "disponible");
  const presentes = activos.filter((p) => presentesIds.has(p.id));

  const urgentVehicles = vehicles.filter((v) => {
    const level = getVehicleServiceAlertLevel(v);
    return level === "vencido" || level === "muy_proximo";
  });
  const overdueCount = urgentVehicles.filter(
    (v) => getVehicleServiceAlertLevel(v) === "vencido"
  ).length;

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink-900">
          Inicio
        </h1>
        <p className="mt-0.5 text-sm text-ink-400">
          Vista general del cuartel en tiempo real
        </p>
      </div>

      <EmergencySiren emergencies={activeEmergencies} myProfileId={profile?.id} />

      {activeEmergencies.length > 0 && (
        <Link
          href="/emergencias"
          className="block overflow-hidden rounded-2xl border border-red-400/40 bg-gradient-to-br from-brand to-brand-dark p-5 text-white shadow-panel transition-transform hover:scale-[1.005]"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            <p className="text-sm font-semibold uppercase tracking-wide">
              {activeEmergencies.length === 1
                ? "1 emergencia activa"
                : `${activeEmergencies.length} emergencias activas`}
            </p>
          </div>
          <p className="mt-1.5 text-lg font-semibold">
            {activeEmergencies[0].title}
          </p>
          <p className="text-sm text-white/85">
            {activeEmergencies[0].address ? `${activeEmergencies[0].address} — ` : ""}
            Tocá para ver y responder
          </p>
        </Link>
      )}

      {isStaff && urgentVehicles.length > 0 && (
        <Link
          href="/flota"
          className="block rounded-2xl border border-orange-200 bg-orange-50 p-4 transition-colors hover:bg-orange-100/70"
        >
          <p className="font-semibold text-orange-900">
            🔧 {urgentVehicles.length === 1
              ? "1 unidad con service próximo"
              : `${urgentVehicles.length} unidades con service próximo`}
            {overdueCount > 0 && (
              <span className="ml-2 font-medium text-red-700">
                ({overdueCount} vencida{overdueCount > 1 ? "s" : ""})
              </span>
            )}
          </p>
          <p className="text-sm text-orange-800/70">Tocá para ver el detalle en Flota</p>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Disponibles"
          value={disponibles.length}
          icon="✅"
          accent="text-emerald-600"
        />
        <StatCard
          label="Presentes en el cuartel"
          value={presentes.length}
          icon="🏠"
          accent="text-brand"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-card">
          <div className="border-b border-black/[0.06] px-5 py-3.5">
            <h2 className="text-[15px] font-semibold text-ink-900">
              Personal disponible ahora
            </h2>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-sm text-ink-400">Cargando…</p>
          ) : disponibles.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-400">
              No hay nadie marcado como disponible en este momento.
            </p>
          ) : (
            <ul className="divide-y divide-black/[0.05]">
              {disponibles.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-5 py-3.5"
                >
                  <div>
                    <p className="text-sm font-medium text-ink-900">{p.full_name}</p>
                    <p className="text-xs text-ink-400">
                      {p.rank ?? "Bombero"}
                      {p.legajo ? ` · Legajo ${p.legajo}` : ""}
                    </p>
                  </div>
                  {presentesIds.has(p.id) && (
                    <span className="rounded-full bg-brand-light px-2.5 py-1 text-xs font-medium text-brand-dark">
                      En el cuartel
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-card">
          <div className="border-b border-black/[0.06] px-5 py-3.5">
            <h2 className="text-[15px] font-semibold text-ink-900">
              Presentes en el cuartel ahora
            </h2>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-sm text-ink-400">Cargando…</p>
          ) : presentes.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-400">
              No hay nadie marcado como presente en el cuartel en este momento.
            </p>
          ) : (
            <ul className="divide-y divide-black/[0.05]">
              {presentes.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-5 py-3.5"
                >
                  <div>
                    <p className="text-sm font-medium text-ink-900">{p.full_name}</p>
                    <p className="text-xs text-ink-400">
                      {p.rank ?? "Bombero"}
                      {p.legajo ? ` · Legajo ${p.legajo}` : ""}
                    </p>
                  </div>
                  {p.availability === "disponible" && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      Disponible
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent = "text-ink-900",
}: {
  label: string;
  value: number;
  icon: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-400">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-base">
          {icon}
        </span>
      </div>
      <p className={`mt-3 text-[32px] font-semibold leading-none tracking-tight ${accent}`}>
        {value}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute section="dashboard">
      <AppShell>
        <DashboardContent />
      </AppShell>
    </ProtectedRoute>
  );
}
