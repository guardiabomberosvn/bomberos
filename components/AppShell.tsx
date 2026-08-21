"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { ROLE_LABELS } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/emergencias", label: "Emergencias", icon: "🚨" },
  { href: "/asistencia", label: "Mi asistencia", icon: "🕐" },
  { href: "/escanear", label: "Escanear QR", icon: "📷" },
  { href: "/hallazgos", label: "Hallazgos", icon: "🚧" },
];

const OPERATION_NAV_ITEMS: NavItem[] = [
  { href: "/asistencia-general", label: "Asistencia (todos)", icon: "📋" },
  { href: "/qr-consola", label: "QR consola", icon: "🖥️" },
  { href: "/libro-guardia", label: "Libro de Guardia", icon: "📖" },
  { href: "/intervenciones", label: "Intervenciones", icon: "🔥" },
  { href: "/flota", label: "Flota", icon: "🚒" },
  { href: "/combustible", label: "Combustible", icon: "⛽" },
  { href: "/mantenimiento", label: "Mantenimiento", icon: "🔧" },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/personal", label: "Personal", icon: "👥" },
  { href: "/grupos", label: "Grupos", icon: "🧑‍🤝‍🧑" },
  { href: "/motivos", label: "Motivos de asistencia", icon: "🏷️" },
];

const ACCOUNT_NAV_ITEMS: NavItem[] = [
  { href: "/vincular-telegram", label: "Alertas por Telegram", icon: "✈️" },
];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function NavDropdown({
  label,
  items,
  active,
}: {
  label: string;
  items: NavItem[];
  active: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          open || active
            ? "bg-ink-800 text-white"
            : "text-ink-500 hover:bg-black/[0.04] hover:text-ink-800"
        }`}
      >
        {label}
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-black/5 bg-white py-1.5 shadow-panel">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors ${
                  pathname === item.href
                    ? "bg-brand-light font-medium text-brand-dark"
                    : "text-ink-700 hover:bg-neutral-50"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = profile?.role === "admin";
  const isStaff = isAdmin || profile?.role === "guardia";

  const primaryItems = [...NAV_ITEMS];
  if (!isStaff) primaryItems.push({ href: "/personal", label: "Personal", icon: "👥" });

  const operationItems = isStaff ? OPERATION_NAV_ITEMS : [];
  const adminItems = isAdmin ? ADMIN_NAV_ITEMS : [];

  const handleSignOut = async () => {
    await signOut();
    router.replace("/");
  };

  const linkClass = (href: string) =>
    `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      pathname === href
        ? "bg-brand text-white shadow-sm"
        : "text-ink-500 hover:bg-black/[0.04] hover:text-ink-800"
    }`;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-10 border-b border-black/[0.06] bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/[0.06]">
              <Image src="/logo.png" alt="Bomberos" fill className="object-contain p-0.5" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-ink-900">
              Sistema Bomberos
            </span>
          </div>

          {profile && (
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-tight text-ink-900">
                  {profile.full_name}
                </p>
                <p className="text-xs leading-tight text-ink-400">
                  {ROLE_LABELS[profile.role]}
                </p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white">
                {initials(profile.full_name)}
              </span>
              <button
                onClick={handleSignOut}
                className="rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-ink-600 transition-colors hover:bg-black/[0.03]"
              >
                Salir
              </button>
            </div>
          )}
        </div>

        <div className="mx-auto max-w-6xl px-4 pb-2.5 sm:px-6">
          <nav className="flex items-center gap-1">
            <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">
              {primaryItems.map((item) => (
                <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>

            <NavDropdown
              label="Operación"
              items={operationItems}
              active={operationItems.some((i) => i.href === pathname)}
            />
            <NavDropdown
              label="Configuración"
              items={adminItems}
              active={adminItems.some((i) => i.href === pathname)}
            />
            <NavDropdown
              label="Mi cuenta"
              items={ACCOUNT_NAV_ITEMS}
              active={ACCOUNT_NAV_ITEMS.some((i) => i.href === pathname)}
            />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6">{children}</main>
    </div>
  );
}
