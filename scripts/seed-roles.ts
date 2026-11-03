// Siembra los 6 roles de equipo (antes hardcodeados en lib/authz.ts) y sus
// permisos por defecto — reproduce EXACTAMENTE el comportamiento de antes
// del 16 sep 2026, para que activar el sistema de roles editables no
// cambie quién puede hacer qué el día que se despliega. Idempotente:
// upsert por code/[roleId,action], nunca pisa un permiso que un Admin ya
// haya editado a mano (mismo criterio que seed-statuses.ts). "Sin acceso"
// se guarda como fila con scope "none" (updateRolePermissions), así el
// upsert la ve y no vuelve a otorgar el permiso por defecto.
//
// CLIENTE no está acá — sigue siendo User.role == "CLIENTE", un eje
// distinto al de roles de equipo (ver ADR "El rol Cliente se mantiene").
import { PrismaClient } from "@prisma/client";
import type { ActionId, Scope } from "../lib/permissions";

const prisma = new PrismaClient();

const DEFAULT_ROLES = [
  { code: "ADMIN", name: "Admin" },
  { code: "LIDER_AREA", name: "Líder de área" },
  { code: "COORDINADOR_CUENTA", name: "Coordinador de cuenta" },
  { code: "DISENADOR_UXUI", name: "Diseñador UX/UI" },
  { code: "SEO", name: "SEO" },
  { code: "DESARROLLADOR", name: "Desarrollador" },
];

// [rol, acción, alcance] — un rol puede aparecer varias veces (una fila
// por acción). Los roles de equipo (Diseño/SEO/Desarrollo) no tienen fila
// para las acciones que no otorgan — ausencia == "none" al resolver.
const DEFAULT_PERMISSIONS: [string, ActionId, Scope][] = [
  ["ADMIN", "requests.access", "all"],
  ["ADMIN", "requests.assign", "all"],
  ["ADMIN", "requests.set_priority", "all"],
  ["ADMIN", "clients.view", "all"],
  ["ADMIN", "reports.export", "all"],
  ["ADMIN", "team.view_load", "all"],
  ["ADMIN", "users.manage", "all"],
  ["ADMIN", "clients.manage", "all"],
  ["ADMIN", "roles.manage", "all"],
  ["ADMIN", "projects.view", "all"],
  ["ADMIN", "projects.manage", "all"],
  ["ADMIN", "projects.budget", "all"],
  ["ADMIN", "hours.manage", "all"],
  ["ADMIN", "requests.change_client", "all"],
  ["ADMIN", "requests.unarchive", "all"],
  ["ADMIN", "followups.view_all", "all"],
  ["ADMIN", "followups.manage", "all"],
  ["ADMIN", "dailys.manage", "all"],

  ["LIDER_AREA", "requests.access", "all"],
  ["LIDER_AREA", "requests.assign", "all"],
  ["LIDER_AREA", "requests.set_priority", "all"],
  ["LIDER_AREA", "clients.view", "all"],
  ["LIDER_AREA", "reports.export", "all"],
  ["LIDER_AREA", "team.view_load", "all"],
  ["LIDER_AREA", "projects.view", "all"],
  ["LIDER_AREA", "projects.manage", "all"],
  ["LIDER_AREA", "projects.budget", "all"],
  ["LIDER_AREA", "followups.view_all", "all"],
  ["LIDER_AREA", "followups.manage", "all"],
  ["LIDER_AREA", "dailys.manage", "own_teams"],

  ["COORDINADOR_CUENTA", "requests.access", "own_clients"],
  ["COORDINADOR_CUENTA", "requests.assign", "all"],
  ["COORDINADOR_CUENTA", "requests.set_priority", "all"],
  ["COORDINADOR_CUENTA", "clients.view", "own_clients"],
  ["COORDINADOR_CUENTA", "reports.export", "own_clients"],
  ["COORDINADOR_CUENTA", "projects.view", "own_clients"],

  ["DISENADOR_UXUI", "requests.access", "assigned"],
  ["SEO", "requests.access", "assigned"],
  ["DESARROLLADOR", "requests.access", "assigned"],
];

export async function seedRoles(client: PrismaClient = prisma) {
  const roleIdByCode: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const role = await client.role.upsert({
      where: { code: r.code },
      update: {},
      create: { ...r, isSystem: true },
    });
    roleIdByCode[r.code] = role.id;
  }

  for (const [code, action, scope] of DEFAULT_PERMISSIONS) {
    await client.rolePermission.upsert({
      where: { roleId_action: { roleId: roleIdByCode[code], action } },
      update: {},
      create: { roleId: roleIdByCode[code], action, scope },
    });
  }

  // "Director de Área" no es rol de sistema (se creó a mano en
  // /admin/roles, sin code fijo): se le dan los mismos permisos de
  // seguimientos que a Líder. Igual que arriba, nunca pisa lo editado.
  const directors = await client.role.findMany({
    where: { name: { contains: "director", mode: "insensitive" } },
    select: { id: true },
  });
  for (const r of directors) {
    for (const [action, scope] of [
      ["followups.view_all", "all"],
      ["followups.manage", "all"],
      ["dailys.manage", "own_teams"],
    ] as const) {
      await client.rolePermission.upsert({
        where: { roleId_action: { roleId: r.id, action } },
        update: {},
        create: { roleId: r.id, action, scope },
      });
    }
  }

  // Backfill: usuarios de equipo (no CLIENTE) que todavía no tienen ningún
  // rol asignado se quedan con el rol que ya tenían en User.role. Solo
  // corre una vez por usuario — si ya tiene un UserRole, se asume que es
  // deliberado (asignado desde /admin/usuarios) y no se toca.
  const usersWithoutRoles = await client.user.findMany({
    where: { role: { not: "CLIENTE" }, roles: { none: {} } },
    select: { id: true, role: true },
  });
  for (const u of usersWithoutRoles) {
    const roleId = roleIdByCode[u.role];
    if (!roleId) continue; // role legado que no matchea ninguno de los 6 — se deja sin rol, visible en /admin/usuarios
    await client.userRole.upsert({
      where: { userId_roleId: { userId: u.id, roleId } },
      update: {},
      create: { userId: u.id, roleId },
    });
  }
}

if (require.main === module) {
  seedRoles()
    .then(() => {
      console.log("roles sembrados:", DEFAULT_ROLES.map((r) => r.code).join(", "));
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
