"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import type { Role } from "@/lib/types";
import { hasSectionAccess, type SectionKey } from "@/lib/permissions";

export function ProtectedRoute({
  children,
  allowedRoles,
  section,
}: {
  children: React.ReactNode;
  allowedRoles?: Role[];
  // Cuando se pasa "section", el acceso se decide con el sistema de
  // permisos por usuario (lib/permissions.ts) en vez de solo por rol.
  section?: SectionKey;
}) {
  const { session, profile, loading } = useAuth();
  const router = useRouter();

  const allowed = !profile
    ? false
    : section
    ? hasSectionAccess(profile, section)
    : allowedRoles
    ? allowedRoles.includes(profile.role)
    : true;

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/");
      return;
    }
    if (profile && !profile.is_active) {
      router.replace("/");
      return;
    }
    if (profile && !allowed) {
      router.replace("/dashboard");
    }
  }, [loading, session, profile, allowed, router]);

  if (loading || !session || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-neutral-500">Cargando…</p>
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
