"use client";

import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { IntervencionesContent } from "@/components/IntervencionesContent";

export default function IntervencionesPage() {
  return (
    <ProtectedRoute section="libro_guardia">
      <AppShell>
        <IntervencionesContent />
      </AppShell>
    </ProtectedRoute>
  );
}
