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
  | "asistencia_general"
  | "qr_consola"
  | "libro_guardia"
  | "flota"
  | "combustible"
  | "mantenimiento"
  | "stock"
  | "personal"
  | "grupos"
  | "motivos";

export interface SectionDef {
  key: SectionKey;
  label: string;
  icon: string;
  href: string;
  group: "operacion" | "configuracion";
  legacyRoles: Role[];
}

export const SECTIONS: SectionDef[] = [
  { key: "asistencia_general", label: "Asistencia (todos)", icon: "📋", href: "/asistencia-general", group: "operacion", legacyRoles: ["admin", "guardia"] },
  { key: "qr_consola", label: "QR consola", icon: "🖥️", href: "/qr-consola", group: "operacion", legacyRoles: ["admin", "guardia"] },
  { key: "libro_guardia", label: "Libro de Guardia", icon: "📖", href: "/libro-guardia", group: "operacion", legacyRoles: ["admin", "guardia"] },
  { key: "flota", label: "Flota", icon: "🚒", href: "/flota", group: "operacion", legacyRoles: ["admin", "guardia"] },
  { key: "combustible", label: "Combustible", icon: "⛽", href: "/combustible", group: "operacion", legacyRoles: ["admin", "guardia"] },
  { key: "mantenimiento", label: "Mantenimiento", icon: "🔧", href: "/mantenimiento", group: "operacion", legacyRoles: ["admin", "guardia"] },
  { key: "stock", label: "Stock", icon: "📦", href: "/stock", group: "operacion", legacyRoles: ["admin", "guardia"] },
  { key: "personal", label: "Personal", icon: "👥", href: "/personal", group: "configuracion", legacyRoles: ["admin", "guardia", "bombero"] },
  { key: "grupos", label: "Grupos", icon: "🧑‍🤝‍🧑", href: "/grupos", group: "configuracion", legacyRoles: ["admin"] },
  { key: "motivos", label: "Motivos de asistencia", icon: "🏷️", href: "/motivos", group: "configuracion", legacyRoles: ["admin"] },
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
