"use client";

import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";

// Destino de respaldo cuando a alguien le restringieron una sección a la que
// intentó entrar. A propósito NO se pasa "section" ni "allowedRoles" acá, así
// que ProtectedRoute deja pasar a cualquiera con sesión activa sin importar
// qué le hayan destildado en Administración — así nunca queda una persona
// sin ningún lugar al que ir dentro del sistema.
function SinAccesoContent() {
  const { profile } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
      <span className="text-3xl">🔒</span>
      <h1 className="text-lg font-semibold text-neutral-900">
        Todavía no tenés acceso a ninguna sección
      </h1>
      <p className="max-w-sm text-sm text-neutral-500">
        {profile?.full_name ? `${profile.full_name}, tu` : "Tu"} administrador
        no te habilitó ninguna sección del sistema por ahora. Pedile que te dé
        acceso desde "Administración".
      </p>
    </div>
  );
}

export default function SinAccesoPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <SinAccesoContent />
      </AppShell>
    </ProtectedRoute>
  );
}
