import type { Prisma } from "@prisma/client";
import {
  type Capabilities,
  hasAccess,
  requestScopeWhere,
  canOnRequest,
  clientScopeWhere,
} from "./permissions";

// Nuevo #3 (16 sep 2026) — reemplaza los roles hardcodeados por permisos
// data-driven (ver lib/permissions.ts, Role/RolePermission/UserRole en el
// esquema). Las firmas de estas funciones se mantienen iguales a las de
// antes de la fusión con Codia Task para no tener que tocar cada archivo
// que ya las llama — solo cambió qué hay adentro.
export type AuthzUser = { id: string; capabilities: Capabilities; ownClientIds?: string[] };

type RequestLike = {
  assigneeId: string | null;
  clientId?: string;
  client: { accountManagerId: string | null };
  collaborators?: { userId: string }[];
};

// CLIENTE no es parte del sistema de roles/permisos — sigue siendo el
// valor especial User.role === "CLIENTE" (ver nota en prisma/schema.prisma
// y ADR "El rol Cliente se mantiene"). Todo lo demás (equipo interno) pasa
// por Role/RolePermission.
export function isTeamRole(role: string): boolean {
  return role !== "CLIENTE";
}

// Mismo grupo de 3 roles que antes (ADMIN, LIDER_AREA, COORDINADOR_CUENTA)
// porque hoy son los únicos con clients.view != "none" — pero ahora es
// consecuencia de los permisos asignados, no de una lista fija de nombres.
export function isManager(user: AuthzUser): boolean {
  return hasAccess(user.capabilities, "clients.view");
}

// Admin/Líder ven y actúan sobre cualquier solicitud (scope "all");
// Coordinador solo las de sus propios clientes ("own_clients"); roles de
// equipo solo la asignada o donde son colaboradores ("assigned"); Cliente
// nunca llega acá (usa sus propios chequeos de clientId). Un usuario con
// varios roles ve la unión de los alcances de todos.
export function canActOnRequest(user: AuthzUser, req: RequestLike): boolean {
  return canOnRequest(user.capabilities, "requests.access", user.id, req, user.ownClientIds);
}

export function canViewRequest(user: AuthzUser, req: RequestLike): boolean {
  return canActOnRequest(user, req);
}

// Filtro para prisma.request.findMany — mismo criterio que canActOnRequest,
// como where.
export function requestVisibilityWhere(user: AuthzUser): Prisma.RequestWhereInput {
  return requestScopeWhere(user.capabilities, "requests.access", user.id);
}

// Filtro para prisma.client.findMany.
export function clientVisibilityWhere(user: AuthzUser): Prisma.ClientWhereInput {
  return clientScopeWhere(user.capabilities, "clients.view", user.id);
}
