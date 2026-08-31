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

// Admin/Líder/Coordinador pueden actuar sobre cualquier solicitud; el resto
// del equipo (Diseño/SEO/Desarrollo), solo sobre la que tienen asignada;
// un Cliente, nunca (usa sus propios chequeos de clientId).
export function canActOnRequest(
  user: { id: string; role: string },
  req: { assigneeId: string | null },
): boolean {
  if (isManager(user.role)) return true;
  if (isTeamRole(user.role)) return req.assigneeId === user.id;
  return false;
}
