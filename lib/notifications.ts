import { supabase } from "@/lib/supabase";
import type { Notification } from "@/lib/types";

// Funciones compartidas entre la campanita del encabezado (AppShell) y la
// página completa de historial (/notificaciones), para no repetir las
// mismas consultas dos veces.

export async function fetchRecentNotifications(limit = 50): Promise<Notification[]> {
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Notification[]) ?? [];
}

export async function fetchReadIds(profileId: string, limit = 500): Promise<Set<string>> {
  const { data } = await supabase
    .from("notification_reads")
    .select("notification_id")
    .eq("profile_id", profileId)
    .limit(limit);
  return new Set(((data as { notification_id: string }[]) ?? []).map((r) => r.notification_id));
}

export async function markNotificationRead(notificationId: string, profileId: string) {
  await supabase
    .from("notification_reads")
    .upsert(
      { notification_id: notificationId, profile_id: profileId },
      { onConflict: "notification_id,profile_id" }
    );
}

export async function markAllNotificationsRead(notificationIds: string[], profileId: string) {
  if (notificationIds.length === 0) return;
  await supabase
    .from("notification_reads")
    .upsert(
      notificationIds.map((id) => ({ notification_id: id, profile_id: profileId })),
      { onConflict: "notification_id,profile_id" }
    );
}

// Tiempo relativo cortito ("hace 5 min", "hace 2 h") para no ocupar lugar.
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  return `hace ${day} d`;
}

export const NOTIFICATION_ICONS: Record<string, string> = {
  stock_retiro: "📦",
  stock_bajo: "⚠️",
  asistencia_checkin: "🟢",
  asistencia_checkout: "🔴",
  disponibilidad: "🕐",
  hallazgo: "🚧",
  mantenimiento: "🔧",
};
