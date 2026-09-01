// Los estados de tablero (antes hardcodeados acá) ahora son editables por
// Admin — ver lib/statuses.ts (getStatuses/getStatusMap, respaldados en la
// tabla Status) y /admin/estados.

export const PRIORITIES = [
  { key: "BAJA", label: "Baja", color: "#7f7f7f" },
  { key: "MEDIA", label: "Media", color: "#08a89f" },
  { key: "ALTA", label: "Alta", color: "#e2532a" },
  { key: "URGENTE", label: "Urgente", color: "#d21f3c" },
];
export const PRIORITY_MAP: Record<string, (typeof PRIORITIES)[number]> =
  Object.fromEntries(PRIORITIES.map((p) => [p.key, p]));

export const ROLES = [
  { key: "ADMIN", label: "Admin" },
  { key: "LIDER_AREA", label: "Líder de área" },
  { key: "COORDINADOR_CUENTA", label: "Coordinador de cuenta" },
  { key: "DISENADOR_UXUI", label: "Diseñador UX/UI" },
  { key: "SEO", label: "SEO" },
  { key: "DESARROLLADOR", label: "Desarrollador" },
  { key: "CLIENTE", label: "Cliente" },
];
export const ROLE_MAP: Record<string, (typeof ROLES)[number]> =
  Object.fromEntries(ROLES.map((r) => [r.key, r]));

export const REQUEST_TYPES = [
  "Desarrollo",
  "Diseño UX/UI",
  "SEO",
  "Contenido",
  "Bug / Corrección",
  "Analítica",
  "Otro",
];
