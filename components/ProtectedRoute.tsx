"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import type { Role } from "@/lib/types";

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: Role[];
}) {
  const { session, profile, loading } = useAuth();
  const router = useRouter();

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
    if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
      router.replace("/dashboard");
    }
  }, [loading, session, profile, allowedRoles, router]);

  if (loading || !session || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-neutral-500">Cargando…</p>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return null;
  }

  return <>{children}</>;
}
