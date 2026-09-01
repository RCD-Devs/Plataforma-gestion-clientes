import type { Prisma } from "@prisma/client";

export const TEAM_ROLES = [
  "ADMIN",
  "LIDER_AREA",
  "COORDINADOR_CUENTA",
  "DISENADOR_UXUI",
  "SEO",
  "DESARROLLADOR",
] as const;

export const MANAGER_ROLES = ["ADMIN", "LIDER_AREA", "COORDINADOR_CUENTA"] as const;

export function isTeamRole(role: string): boolean {
  return (TEAM_ROLES as readonly string[]).includes(role);
}

export function isManager(role: string): boolean {
  return (MANAGER_ROLES as readonly string[]).includes(role);
}

// Admin/Líder pueden actuar sobre cualquier solicitud; Coordinador solo sobre
// las de sus propios clientes (Rec. #22); Diseño/SEO/Desarrollo solo sobre la
// que tienen asignada (Rec. #21); un Cliente, nunca (usa sus propios chequeos
// de clientId). Se mantiene coherente con canViewRequest: nadie puede actuar
// sobre algo que no puede ver.
export function canActOnRequest(
  user: { id: string; role: string },
  req: { assigneeId: string | null; client: { accountManagerId: string | null } },
): boolean {
  if (user.role === "ADMIN" || user.role === "LIDER_AREA") return true;
  if (user.role === "COORDINADOR_CUENTA") return req.client.accountManagerId === user.id;
  if (isTeamRole(user.role)) return req.assigneeId === user.id;
  return false;
}

export function canViewRequest(
  user: { id: string; role: string },
  req: { assigneeId: string | null; client: { accountManagerId: string | null } },
): boolean {
  return canActOnRequest(user, req);
}

// Filtro para prisma.request.findMany — mismo criterio que canActOnRequest,
// como where.
export function requestVisibilityWhere(user: {
  id: string;
  role: string;
}): Prisma.RequestWhereInput {
  if (user.role === "ADMIN" || user.role === "LIDER_AREA") return {};
  if (user.role === "COORDINADOR_CUENTA") {
    return { client: { accountManagerId: user.id } };
  }
  if (isTeamRole(user.role)) return { assigneeId: user.id };
  return { id: "__ninguna__" }; // no debería llegar aquí (Cliente ya se excluye en el layout)
}

// Filtro para prisma.client.findMany.
export function clientVisibilityWhere(user: {
  id: string;
  role: string;
}): Prisma.ClientWhereInput {
  if (user.role === "COORDINADOR_CUENTA") return { accountManagerId: user.id };
  return {};
}
