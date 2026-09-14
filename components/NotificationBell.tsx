"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Notification } from "@/lib/types";
import {
  fetchRecentNotifications,
  fetchReadIds,
  markNotificationRead,
  markAllNotificationsRead,
  timeAgo,
  NOTIFICATION_ICONS,
} from "@/lib/notifications";

// Campanita chica en el encabezado: solo texto, sin sonidos ni avisos que
// aparezcan solos — el punto rojo con el número es lo único "molesto", y
// desaparece apenas se lee. Se arma como su propio botón (no como un link
// más del menú) porque es algo para consultar, no una sección a la que se
// entra a trabajar.
export function NotificationBell({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const [notifs, reads] = await Promise.all([
      fetchRecentNotifications(50),
      fetchReadIds(profileId),
    ]);
    setItems(notifs);
    setReadIds(reads);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("notifications-bell")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const unreadCount = items.filter((n) => !readIds.has(n.id)).length;

  const handleItemClick = async (n: Notification) => {
    if (!readIds.has(n.id)) {
      setReadIds((prev) => new Set(prev).add(n.id));
      await markNotificationRead(n.id, profileId);
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  const handleMarkAllRead = async () => {
    const unreadItemIds = items.filter((n) => !readIds.has(n.id)).map((n) => n.id);
    if (unreadItemIds.length === 0) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      unreadItemIds.forEach((id) => next.add(id));
      return next;
    });
    await markAllNotificationsRead(unreadItemIds, profileId);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notificaciones"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-black/[0.04] hover:text-ink-800"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border border-black/5 bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Notificaciones
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-brand hover:underline"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-neutral-400">
                Sin notificaciones todavía.
              </p>
            ) : (
              items.map((n) => {
                const isUnread = !readIds.has(n.id);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={`flex w-full flex-col gap-0.5 border-b border-neutral-50 px-3 py-2 text-left text-xs transition-colors last:border-b-0 hover:bg-neutral-50 ${
                      isUnread ? "bg-brand-light/40" : ""
                    }`}
                  >
                    <span
                      className={`leading-snug ${
                        isUnread ? "font-semibold text-neutral-900" : "text-neutral-600"
                      }`}
                    >
                      {NOTIFICATION_ICONS[n.type] ?? "🔔"} {n.title}
                    </span>
                    {n.body && <span className="text-[11px] text-neutral-500">{n.body}</span>}
                    <span className="text-[10px] text-neutral-400">{timeAgo(n.created_at)}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-neutral-100 px-3 py-2 text-center">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/notificaciones");
              }}
              className="text-xs font-medium text-brand hover:underline"
            >
              Ver historial completo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
