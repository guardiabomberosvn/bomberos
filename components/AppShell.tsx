"use client";

import { useEffect, useRef, useState } from "react";
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
  { href: "/stock", label: "Stock", icon: "📦" },
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

// ---------------------------------------------------------------------------
// Navegación de escritorio: barra horizontal con menús desplegables.
// El menú calcula su posición con JS (en vez de solo CSS) para no salirse
// nunca del ancho de pantalla disponible, sin importar dónde caiga el botón.
// ---------------------------------------------------------------------------
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const MENU_WIDTH = 240; // debe coincidir con w-60 de abajo
  const EDGE_MARGIN = 12; // separación mínima con el borde de la pantalla

  useEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const idealLeft = rect.right - MENU_WIDTH;
      const maxLeft = window.innerWidth - MENU_WIDTH - EDGE_MARGIN;
      const left = Math.max(EDGE_MARGIN, Math.min(idealLeft, maxLeft));
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 8,
        left,
        width: MENU_WIDTH,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
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
          <div
            style={menuStyle}
            className="z-20 w-60 overflow-hidden rounded-xl border border-black/5 bg-white py-1.5 shadow-panel"
          >
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

// ---------------------------------------------------------------------------
// Navegación mobile: cajón lateral a pantalla completa con todo en columna.
// No depende de que varios botones entren en una fila, así que funciona
// igual de bien en un celular chico que en uno grande o en una tablet.
// ---------------------------------------------------------------------------
interface NavSection {
  title: string | null;
  items: NavItem[];
}

function MobileMenuIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

function MobileNavDrawer({
  open,
  onClose,
  sections,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  sections: NavSection[];
  pathname: string;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-[85vw] max-w-sm flex-col bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3.5">
          <span className="text-sm font-semibold text-ink-900">Menú</span>
          <button
            onClick={onClose}
            aria-label="Cerrar menú"
            className="rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-black/[0.04]"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {sections.map((section, i) =>
            section.items.length === 0 ? null : (
              <div key={i} className="mb-2">
                {section.title && (
                  <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-medium transition-colors ${
                        pathname === item.href
                          ? "bg-brand-light text-brand-dark"
                          : "text-ink-700 hover:bg-black/[0.04]"
                      }`}
                    >
                      <span className="text-lg">{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = profile?.role === "admin";
  const isStaff = isAdmin || profile?.role === "guardia";

  const primaryItems = [...NAV_ITEMS];
  if (!isStaff) primaryItems.push({ href: "/personal", label: "Personal", icon: "👥" });

  const operationItems = isStaff ? OPERATION_NAV_ITEMS : [];
  const adminItems = isAdmin ? ADMIN_NAV_ITEMS : [];

  const sections: NavSection[] = [
    { title: null, items: primaryItems },
    { title: "Operación", items: operationItems },
    { title: "Configuración", items: adminItems },
    { title: "Mi cuenta", items: ACCOUNT_NAV_ITEMS },
  ];

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
          {/* Barra horizontal — solo desde tablet/escritorio (md y más) */}
          <nav className="hidden items-center gap-1 md:flex">
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

          {/* Botón de menú — solo en celular (debajo de md) */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-black/[0.03] md:hidden"
          >
            <MobileMenuIcon />
            Menú
          </button>
        </div>
      </header>

      <MobileNavDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        sections={sections}
        pathname={pathname}
      />

      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6">{children}</main>
    </div>
  );
}
