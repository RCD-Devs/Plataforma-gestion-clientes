export type StatusKey =
  | "TAREAS_RECURRENTES"
  | "POR_HACER"
  | "EN_PAUSA"
  | "EN_DESARROLLO"
  | "EN_REVISION"
  | "FINALIZADA";

// Colores alineados a la paleta REVO:
// navy #081826 · turquesa #0BDBCF · naranja #FB693B · naranja claro #FDA565 · gris #7F7F7F
export const STATUSES: {
  key: StatusKey;
  label: string;
  color: string;
  soft: string;
}[] = [
  { key: "TAREAS_RECURRENTES", label: "Tareas recurrentes", color: "#7f7f7f", soft: "#f1f3f4" },
  { key: "POR_HACER", label: "Por hacer", color: "#16324a", soft: "#e8eef3" },
  { key: "EN_PAUSA", label: "En pausa", color: "#c97416", soft: "#fdf1e3" },
  { key: "EN_DESARROLLO", label: "En desarrollo", color: "#08a89f", soft: "#e0fbf9" },
  { key: "EN_REVISION", label: "En revisión", color: "#e2532a", soft: "#feede6" },
  { key: "FINALIZADA", label: "Finalizada", color: "#0e9f6e", soft: "#e6f7f0" },
];

export const STATUS_MAP: Record<string, (typeof STATUSES)[number]> =
  Object.fromEntries(STATUSES.map((s) => [s.key, s]));

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
