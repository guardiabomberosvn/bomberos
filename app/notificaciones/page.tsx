"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import type { Notification } from "@/lib/types";
import {
  fetchRecentNotifications,
  fetchReadIds,
  markNotificationRead,
  markAllNotificationsRead,
  timeAgo,
  NOTIFICATION_ICONS,
} from "@/lib/notifications";

function NotificacionesContent() {
  const { profile } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const [notifs, reads] = await Promise.all([
      fetchRecentNotifications(200),
      fetchReadIds(profile.id),
    ]);
    setItems(notifs);
    setReadIds(reads);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const unreadCount = items.filter((n) => !readIds.has(n.id)).length;

  const handleItemClick = async (n: Notification) => {
    if (profile && !readIds.has(n.id)) {
      setReadIds((prev) => new Set(prev).add(n.id));
      await markNotificationRead(n.id, profile.id);
    }
    if (n.link) router.push(n.link);
  };

  const handleMarkAllRead = async () => {
    if (!profile) return;
    const unreadItemIds = items.filter((n) => !readIds.has(n.id)).map((n) => n.id);
    if (unreadItemIds.length === 0) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      unreadItemIds.forEach((id) => next.add(id));
      return next;
    });
    await markAllNotificationsRead(unreadItemIds, profile.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Notificaciones</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Historial de avisos: stock, entradas/salidas, disponibilidad, hallazgos y mantenimiento.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Marcar todas como leídas
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            Sin notificaciones todavía.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {items.map((n) => {
              const isUnread = !readIds.has(n.id);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-neutral-50 ${
                      isUnread ? "bg-brand-light/30" : ""
                    }`}
                  >
                    <span className="mt-0.5 text-base">{NOTIFICATION_ICONS[n.type] ?? "🔔"}</span>
                    <div className="flex-1">
                      <p
                        className={
                          isUnread ? "font-semibold text-neutral-900" : "text-neutral-700"
                        }
                      >
                        {n.title}
                      </p>
                      {n.body && <p className="text-neutral-500">{n.body}</p>}
                      <p className="mt-0.5 text-xs text-neutral-400">{timeAgo(n.created_at)}</p>
                    </div>
                    {isUnread && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function NotificacionesPage() {
  return (
    <ProtectedRoute section="notificaciones">
      <AppShell>
        <NotificacionesContent />
      </AppShell>
    </ProtectedRoute>
  );
}
