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
  group: "general" | "operacion" | "libroGuardia" | "configuracion";
  legacyRoles: Role[];
}

export const SECTIONS: SectionDef[] = [
  { key: "dashboard", label: "Inicio", icon: "🏠", href: "/dashboard", group: "general", legacyRoles: ["admin", "guardia", "bombero"] },
  // Estas 4 quedan agrupadas juntas bajo un mismo menú "Libro de guardia"
  // (antes estaban mezcladas dentro de "Operación").
  { key: "asistencia_general", label: "Asistencia (todos)", icon: "📋", href: "/asistencia-general", group: "libroGuardia", legacyRoles: ["admin", "guardia"] },
  { key: "qr_consola", label: "QR de asistencia", icon: "🖥️", href: "/qr-consola", group: "libroGuardia", legacyRoles: ["admin", "guardia"] },
  { key: "libro_guardia", label: "Libro de Guardia", icon: "📖", href: "/libro-guardia", group: "libroGuardia", legacyRoles: ["admin", "guardia"] },
  { key: "stock", label: "Stock", icon: "📦", href: "/stock", group: "libroGuardia", legacyRoles: ["admin", "guardia"] },
  { key: "flota", label: "Flota", icon: "🚒", href: "/flota", group: "operacion", legacyRoles: ["admin", "guardia"] },
  { key: "combustible", label: "Combustible", icon: "⛽", href: "/combustible", group: "operacion", legacyRoles: ["admin", "guardia"] },
  { key: "mantenimiento", label: "Mantenimiento", icon: "🔧", href: "/mantenimiento", group: "operacion", legacyRoles: ["admin", "guardia"] },
  // Personal: solo admin y guardia lo ven por defecto (antes también lo
  // veían los bomberos). Un admin puede seguir dándoselo puntualmente a
  // alguien desde Administración.
  { key: "personal", label: "Personal", icon: "👥", href: "/personal", group: "configuracion", legacyRoles: ["admin", "guardia"] },
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
