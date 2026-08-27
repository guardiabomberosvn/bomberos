"use client";

import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { IntervencionesContent } from "@/components/IntervencionesContent";

export default function IntervencionesPage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "guardia"]}>
      <AppShell>
        <IntervencionesContent />
      </AppShell>
    </ProtectedRoute>
  );
}
