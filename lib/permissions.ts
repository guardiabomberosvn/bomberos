import type { Profile, Role } from "@/lib/types";

// ---------------------------------------------------------------------------
// Permisos por usuario (apartado "Administración")
//
// Cada sección "controlable" es una página del sistema que antes estaba
// habilitada solo por rol (admin / guardia / bombero). Ahora, además del
// rol, un administrador puede personalizar por usuario a cuáles de estas
// secciones tiene acceso — ej: darle Flota a un bombero puntual, o
// sacarle Stock a un guardia puntual.
//
// profile.allowed_sections:
//   - null      → todavía no se personalizó: se usa "legacyRoles" (el
//                 comportamiento de siempre, para no afectar a nadie).
//   - string[]  → lista exacta de secciones habilitadas para ese usuario,
//                 sin importar su rol (admin siempre tiene acceso a todo,
//                 aparte de esto).
// ---------------------------------------------------------------------------

export type SectionKey =
  | "dashboard"
  | "asistencia"
  | "escanear"
  | "asistencia_general"
  | "qr_consola"
  | "libro_guardia"
  | "flota"
  | "combustible"
  | "mantenimiento"
  | "proveedores"
  | "stock"
  | "personal"
  | "grupos"
  | "motivos"
  | "notificaciones"
  | "emergencias"
  | "hallazgos"
  | "checkin"
  // No es una página propia: controla, adentro de "Asistencia (todos)", si
  // esa persona ve el resumen de horas/puntos y el ranking "Puntaje por
  // persona" — independiente de si puede entrar a esa página y cargar
  // asistencia. Que alguien tenga habilitado "Asistencia (todos)" (o
  // "Libro de Guardia") no le habilita esto de regalo.
  | "asistencia_puntajes";

export interface SectionDef {
  key: SectionKey;
  label: string;
  icon: string;
  href: string;
  group: "general" | "operacion" | "libroGuardia" | "configuracion";
  legacyRoles: Role[];
}

export const SECTIONS: SectionDef[] = [
  { key: "dashboard", label: "Inicio", icon: "🏠", href: "/dashboard", group: "general", legacyRoles: ["admin", "guardia", "jefatura", "bombero"] },
  // "Mi asistencia" y "Escanear QR" antes estaban fijos para cualquiera con
  // sesión (no eran configurables). Ahora un admin puede sacárselos a
  // alguien puntual igual que cualquier otra sección.
  { key: "asistencia", label: "Mi asistencia", icon: "🕐", href: "/asistencia", group: "general", legacyRoles: ["admin", "guardia", "jefatura", "bombero"] },
  { key: "escanear", label: "Escanear QR", icon: "📷", href: "/escanear", group: "general", legacyRoles: ["admin", "guardia", "jefatura", "bombero"] },
  // Emergencias y Hallazgos antes eran links fijos en el menú, visibles para
  // cualquiera con sesión sin forma de restringirlos. Ahora son una sección
  // más: por defecto siguen habilitados para todos los roles (nadie pierde
  // acceso), pero ya se pueden personalizar por persona desde Administración.
  { key: "emergencias", label: "Emergencias", icon: "🚨", href: "/emergencias", group: "general", legacyRoles: ["admin", "guardia", "jefatura", "bombero"] },
  { key: "hallazgos", label: "Hallazgos", icon: "🚧", href: "/hallazgos", group: "general", legacyRoles: ["admin", "guardia", "jefatura", "bombero"] },
  // La campanita de notificaciones (stock, entradas/salidas, disponibilidad,
  // hallazgos, mantenimiento) tiene su propio botón en el encabezado, no un
  // link de menú común — ver la exclusión en AppShell.navItemsForGroup. Por
  // defecto es para admin/guardia/jefatura, pero se puede dar o sacar por
  // persona igual que cualquier otra sección (incluso a un bombero puntual).
  { key: "notificaciones", label: "Notificaciones", icon: "🔔", href: "/notificaciones", group: "general", legacyRoles: ["admin", "guardia", "jefatura"] },
  // Estas 4 quedan agrupadas juntas bajo un mismo menú "Libro de guardia"
  // (antes estaban mezcladas dentro de "Operación").
  { key: "asistencia_general", label: "Asistencia (todos)", icon: "📋", href: "/asistencia-general", group: "libroGuardia", legacyRoles: ["admin", "guardia", "jefatura"] },
  // Ver el resumen de horas/puntos y el ranking de "Puntaje por persona"
  // dentro de Asistencia (todos). legacyRoles admin y jefatura a propósito:
  // antes cualquiera con acceso a esa página lo veía de regalo, ahora es
  // admin/jefatura por defecto y vos elegís a quién más se lo das desde
  // Administración.
  { key: "asistencia_puntajes", label: "Puntaje y horas (en Asistencia)", icon: "🏆", href: "/asistencia-general", group: "libroGuardia", legacyRoles: ["admin", "jefatura"] },
  { key: "qr_consola", label: "QR de asistencia", icon: "🖥️", href: "/qr-consola", group: "libroGuardia", legacyRoles: ["admin", "guardia", "jefatura"] },
  { key: "libro_guardia", label: "Libro de Guardia", icon: "📖", href: "/libro-guardia", group: "libroGuardia", legacyRoles: ["admin", "guardia", "jefatura"] },
  { key: "stock", label: "Stock", icon: "📦", href: "/stock", group: "libroGuardia", legacyRoles: ["admin", "guardia", "jefatura"] },
  { key: "flota", label: "Flota", icon: "🚒", href: "/flota", group: "operacion", legacyRoles: ["admin", "guardia", "jefatura"] },
  { key: "combustible", label: "Combustible", icon: "⛽", href: "/combustible", group: "libroGuardia", legacyRoles: ["admin", "guardia", "jefatura"] },
  { key: "mantenimiento", label: "Mantenimiento", icon: "🔧", href: "/mantenimiento", group: "operacion", legacyRoles: ["admin", "guardia", "jefatura"] },
  { key: "proveedores", label: "Proveedores", icon: "📇", href: "/proveedores", group: "operacion", legacyRoles: ["admin", "guardia", "jefatura"] },
  // Personal: admin, guardia y jefatura lo ven por defecto. Un admin puede
  // seguir dándoselo o sacándoselo puntualmente a alguien desde
  // Administración.
  { key: "personal", label: "Personal", icon: "👥", href: "/personal", group: "configuracion", legacyRoles: ["admin", "guardia", "jefatura"] },
  { key: "grupos", label: "Grupos", icon: "🧑‍🤝‍🧑", href: "/grupos", group: "configuracion", legacyRoles: ["admin", "jefatura"] },
  { key: "motivos", label: "Motivos de asistencia", icon: "🏷️", href: "/motivos", group: "configuracion", legacyRoles: ["admin", "jefatura"] },
  // Pantalla para la tablet compartida del cuartel: el bombero se marca
  // ingreso/egreso escribiendo su legajo. legacyRoles vacío a propósito —
  // nadie la ve por defecto (ni admin), incluida esta sola a mano desde
  // Administración, en la cuenta fija que se deje cargada en la tablet.
  { key: "checkin", label: "Check-in (tablet)", icon: "🪪", href: "/checkin", group: "general", legacyRoles: [] },
];

export function hasSectionAccess(
  profile: Pick<Profile, "role" | "allowed_sections">,
  key: SectionKey
): boolean {
  // OJO: acá NO hay bypass automático para role === "admin". El
  // administrador de la cuenta puede personalizar los accesos de
  // cualquier persona, incluida otra marcada como "Administrador" — así
  // se puede armar el acceso de cada uno a mano, parte por parte. Mientras
  // nadie la personalice, una persona admin sigue viendo todo (ver
  // legacyRoles más abajo), que es el comportamiento de siempre.
  if (profile.allowed_sections) return profile.allowed_sections.includes(key);
  const def = SECTIONS.find((s) => s.key === key);
  return def ? def.legacyRoles.includes(profile.role) : false;
}
