// Catálogo de permisos granulares (ADR-011, Nuevo #3, 16 sep 2026) — cada
// acción mapea 1:1 a un chequeo real que ya existía hardcodeado en
// lib/authz.ts. No se inventó granularidad nueva: son los mismos 8 puntos
// de autorización de siempre, ahora editables por rol desde /admin/roles.
import type { Prisma } from "@prisma/client";

export type Scope = "all" | "own_clients" | "assigned" | "none";

export const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "own_clients", label: "Solo sus clientes" },
  { key: "assigned", label: "Solo asignadas/colabora" },
  { key: "none", label: "Sin acceso" },
];

export type ActionId =
  | "requests.access"
  | "requests.assign"
  | "requests.set_priority"
  | "clients.view"
  | "reports.export"
  | "team.view_load"
  | "users.manage"
  | "clients.manage"
  | "roles.manage"
  | "projects.view"
  | "projects.manage"
  | "projects.budget";

export const ACTIONS: { key: ActionId; label: string; scopes: Scope[] }[] = [
  {
    key: "requests.access",
    label: "Ver y actuar sobre solicitudes (tablero, detalle, comentar, horas, archivar)",
    scopes: ["all", "own_clients", "assigned", "none"],
  },
  {
    key: "requests.assign",
    label: "Asignar / reasignar responsable",
    scopes: ["all", "none"],
  },
  {
    key: "requests.set_priority",
    label: "Cambiar prioridad interna",
    scopes: ["all", "none"],
  },
  {
    key: "clients.view",
    label: "Ver Dashboard, Bolsa de horas, Clientes, reporte SLA y notificaciones del equipo",
    scopes: ["all", "own_clients", "none"],
  },
  {
    key: "reports.export",
    label: "Exportar reportes de cliente/dashboard",
    scopes: ["all", "own_clients", "none"],
  },
  {
    key: "team.view_load",
    label: "Ver «Mi equipo» (carga de trabajo)",
    scopes: ["all", "none"],
  },
  {
    key: "users.manage",
    label: "Administrar usuarios y equipos",
    scopes: ["all", "none"],
  },
  {
    key: "clients.manage",
    label: "Administrar clientes (alta, edición, desactivación)",
    scopes: ["all", "none"],
  },
  {
    key: "roles.manage",
    label: "Administrar roles y permisos",
    scopes: ["all", "none"],
  },
  {
    key: "projects.view",
    label: "Ver proyectos (ficha, etapas, consumo de horas)",
    scopes: ["all", "own_clients", "none"],
  },
  {
    key: "projects.manage",
    label: "Crear/archivar proyectos, gestionar etapas y asignar tareas a etapas",
    scopes: ["all", "own_clients", "none"],
  },
  {
    key: "projects.budget",
    label: "Cargar y editar la cubicación estimada (horas y fechas) del proyecto",
    scopes: ["all", "own_clients", "none"],
  },
];

export const ACTION_MAP: Record<ActionId, (typeof ACTIONS)[number]> =
  Object.fromEntries(ACTIONS.map((a) => [a.key, a])) as Record<ActionId, (typeof ACTIONS)[number]>;

// Capacidades resueltas de un usuario: por cada acción, el conjunto de
// alcances que le otorga CADA UNO de sus roles (unión real — si Rol A da
// "own_clients" y Rol B da "assigned", el usuario ve ambos, no solo el más
// amplio de los dos). Se calcula una vez en getSessionUser() y viaja en la
// sesión — todo lo de abajo es sincrónico, sin queries extra por chequeo.
export type Capabilities = Record<string, Scope[]>;

export function buildCapabilities(
  rows: { action: string; scope: string }[],
): Capabilities {
  const caps: Capabilities = {};
  for (const r of rows) {
    const scope = r.scope as Scope;
    (caps[r.action] ??= []).push(scope);
  }
  return caps;
}

// Para filtrar/mostrar la capacidad de OTRO usuario (no el de la sesión
// actual) — ej. "¿cuáles de estos usuarios pueden ser Coordinador de
// cuenta?" en /admin/clientes. Requiere el include roles.role.permissions.
export function attachCapabilities<
  T extends { roles: { role: { archivedAt: Date | null; permissions: { action: string; scope: string }[] } }[] },
>(user: T): T & { capabilities: Capabilities } {
  const activePerms = user.roles
    .filter((ur) => !ur.role.archivedAt)
    .flatMap((ur) => ur.role.permissions);
  return { ...user, capabilities: buildCapabilities(activePerms) };
}

function grantedScopes(caps: Capabilities, action: ActionId): Scope[] {
  return caps[action] ?? [];
}

export function hasAccess(caps: Capabilities, action: ActionId): boolean {
  return grantedScopes(caps, action).some((s) => s !== "none");
}

// Para vistas tipo "Solicitudes/Clientes de X" — arma el where de Prisma
// uniendo cada alcance otorgado. "all" gana siempre (sin filtro).
// "Mis clientes": donde soy coordinador de cuenta o estoy asignado.
function ownClientWhere(userId: string): Prisma.ClientWhereInput {
  return { OR: [{ accountManagerId: userId }, { members: { some: { userId } } }] };
}

export function requestScopeWhere(
  caps: Capabilities,
  action: ActionId,
  userId: string,
): Prisma.RequestWhereInput {
  const scopes = grantedScopes(caps, action);
  if (scopes.includes("all")) return {};
  const or: Prisma.RequestWhereInput[] = [];
  if (scopes.includes("own_clients")) or.push({ client: ownClientWhere(userId) });
  if (scopes.includes("assigned")) {
    or.push({ OR: [{ assigneeId: userId }, { collaborators: { some: { userId } } }] });
  }
  if (or.length === 0) return { id: "__ninguna__" };
  return { OR: or };
}

// ownClientIds = clientes del usuario (coordinador o asignado), resueltos
// una vez en la sesión; req.clientId lo trae cualquier Request cargado.
export function matchesRequestScope(
  scope: Scope,
  userId: string,
  req: {
    assigneeId: string | null;
    clientId?: string;
    client: { accountManagerId: string | null };
    collaborators?: { userId: string }[];
  },
  ownClientIds: readonly string[] = [],
): boolean {
  if (scope === "all") return true;
  if (scope === "own_clients") {
    return (
      req.client.accountManagerId === userId ||
      (req.clientId !== undefined && ownClientIds.includes(req.clientId))
    );
  }
  if (scope === "assigned") {
    return (
      req.assigneeId === userId ||
      (req.collaborators?.some((c) => c.userId === userId) ?? false)
    );
  }
  return false;
}

export function canOnRequest(
  caps: Capabilities,
  action: ActionId,
  userId: string,
  req: {
    assigneeId: string | null;
    clientId?: string;
    client: { accountManagerId: string | null };
    collaborators?: { userId: string }[];
  },
  ownClientIds: readonly string[] = [],
): boolean {
  return grantedScopes(caps, action).some((s) => matchesRequestScope(s, userId, req, ownClientIds));
}

export function clientScopeWhere(
  caps: Capabilities,
  action: ActionId,
  userId: string,
): Prisma.ClientWhereInput {
  const scopes = grantedScopes(caps, action);
  if (scopes.includes("all")) return {};
  if (scopes.includes("own_clients")) return ownClientWhere(userId);
  return { id: "__ninguno__" };
}

// Para páginas que ya cargaron un Client puntual (ej. /clientes/[id]/reporte)
// y solo necesitan validar si ESTE usuario puede verlo, sin armar un where.
export function canOnClient(
  caps: Capabilities,
  action: ActionId,
  userId: string,
  client: { id?: string; accountManagerId: string | null },
  ownClientIds: readonly string[] = [],
): boolean {
  const scopes = grantedScopes(caps, action);
  if (scopes.includes("all")) return true;
  if (scopes.includes("own_clients")) {
    return (
      client.accountManagerId === userId ||
      (client.id !== undefined && ownClientIds.includes(client.id))
    );
  }
  return false;
}
