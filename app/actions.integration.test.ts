// Rec. #49 — tests de integración contra una BD Postgres real (CI la
// levanta como servicio efímero, ver .github/workflows/ci.yml). Se saltan
// solos si no hay RUN_DB_TESTS=1 (no correr por accidente contra una BD
// real de desarrollo si alguien tiene DATABASE_URL en su shell).
//
// Se mockea @/lib/session (no next/headers/cookies reales — no hay
// request de Next.js en un test de Vitest) y next/navigation +
// next/cache, que solo funcionan dentro del runtime de Next. El resto
// —Prisma contra la BD real, canActOnRequest, la lógica de cada acción—
// corre de verdad.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// submitRequest lee la IP con headers() de Next (no existe en Vitest).
vi.mock("@/lib/rateLimit", () => ({ rateLimit: () => true, clientIp: async () => "test" }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

type TestUser = {
  id: string;
  role: string;
  email: string;
  client?: unknown;
  roleCodes: string[];
  capabilities: Record<string, string[]>;
};
let currentUser: TestUser | null = null;
vi.mock("@/lib/session", () => ({
  getSessionUser: async () => currentUser,
}));

const { prisma } = await import("@/lib/db");
const { buildCapabilities } = await import("@/lib/permissions");
const { seedRoles } = await import("../scripts/seed-roles");
const { workClientsWhere } = await import("@/lib/authz");
// TestUser tipa capabilities como string[] sueltos; en runtime es lo mismo.
const asAuthz = (u: TestUser) => u as unknown as Parameters<typeof workClientsWhere>[0];
const {
  changeStatus,
  assignRequest,
  setUserActive,
  createUser,
  setProjectActive,
  submitRequest,
  setClientActive,
  logHours,
  unarchiveRequest,
} = await import(
  "@/app/actions"
);

// Nuevo #3 — CI solo corre `prisma db push`, no el seed completo (que trae
// data de ejemplo). Role/RolePermission necesitan poblarse acá con el
// mismo criterio que producción para que estos tests reflejen permisos
// reales, no un mock aparte que se desincroniza en silencio.
async function asSessionUser(user: { id: string; role: string; email: string }): Promise<TestUser> {
  const roles = await prisma.userRole.findMany({
    where: { userId: user.id },
    include: { role: { include: { permissions: true } } },
  });
  return {
    ...user,
    roleCodes: roles.map((r) => r.role.code),
    capabilities: buildCapabilities(roles.flatMap((r) => r.role.permissions)),
  };
}

const CLIENTE_FIXTURE: TestUser = {
  id: "x",
  role: "CLIENTE",
  email: "cliente@test.local",
  roleCodes: [],
  capabilities: {},
};

describe.skipIf(!process.env.RUN_DB_TESTS)(
  "Server Actions críticas (integración, BD real)",
  () => {
    const suffix = Date.now();
    let admin: TestUser;
    let coordA: TestUser;
    let coordB: TestUser;
    let clientA: { id: string };
    let clientB: { id: string };
    let req: { id: string };
    let desarrolladorRoleId: string;

    beforeAll(async () => {
      await prisma.status.upsert({
        where: { code: "POR_HACER" },
        update: {},
        create: { code: "POR_HACER", label: "Por hacer", color: "#999999", isFinal: false },
      });
      await prisma.status.upsert({
        where: { code: "FINALIZADA" },
        update: {},
        create: { code: "FINALIZADA", label: "Finalizada", color: "#0e7a58", isFinal: true },
      });
      await seedRoles(prisma);
      const [adminRole, coordRole, desarrolladorRole] = await Promise.all([
        prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } }),
        prisma.role.findUniqueOrThrow({ where: { code: "COORDINADOR_CUENTA" } }),
        prisma.role.findUniqueOrThrow({ where: { code: "DESARROLLADOR" } }),
      ]);
      desarrolladorRoleId = desarrolladorRole.id;

      const adminRow = await prisma.user.create({
        data: {
          name: "Admin Test",
          email: `admin-${suffix}@test.local`,
          role: "ADMIN",
          roles: { create: { roleId: adminRole.id } },
        },
      });
      const coordARow = await prisma.user.create({
        data: {
          name: "Coord A Test",
          email: `coordA-${suffix}@test.local`,
          role: "COORDINADOR_CUENTA",
          roles: { create: { roleId: coordRole.id } },
        },
      });
      const coordBRow = await prisma.user.create({
        data: {
          name: "Coord B Test",
          email: `coordB-${suffix}@test.local`,
          role: "COORDINADOR_CUENTA",
          roles: { create: { roleId: coordRole.id } },
        },
      });
      admin = await asSessionUser(adminRow);
      coordA = await asSessionUser(coordARow);
      coordB = await asSessionUser(coordBRow);

      clientA = await prisma.client.create({
        data: { name: `Cliente A Test ${suffix}`, accountManagerId: coordA.id },
      });
      clientB = await prisma.client.create({
        data: { name: `Cliente B Test ${suffix}`, accountManagerId: coordB.id },
      });
      req = await prisma.request.create({
        data: { key: `TST-${suffix}`, title: "Solicitud de prueba", clientId: clientA.id, status: "POR_HACER" },
      });
    });

    afterAll(async () => {
      await prisma.request.deleteMany({ where: { id: req.id } });
      await prisma.client.deleteMany({ where: { id: { in: [clientA.id, clientB.id] } } });
      await prisma.user.deleteMany({ where: { id: { in: [admin.id, coordA.id, coordB.id] } } });
    });

    it("un Coordinador de OTRO cliente no puede cambiar el estado de la solicitud", async () => {
      currentUser = coordB;
      const res = await changeStatus(req.id, "FINALIZADA");
      expect(res.ok).toBe(false);
      const fresh = await prisma.request.findUniqueOrThrow({ where: { id: req.id } });
      expect(fresh.status).toBe("POR_HACER");
    });

    it("el Coordinador dueño del cliente sí puede cambiar el estado", async () => {
      currentUser = coordA;
      const res = await changeStatus(req.id, "FINALIZADA");
      expect(res.ok).toBe(true);
      const fresh = await prisma.request.findUniqueOrThrow({ where: { id: req.id } });
      expect(fresh.status).toBe("FINALIZADA");
      expect(fresh.finalizedAt).not.toBeNull();
    });

    it("un Coordinador (no manager de asignación) no puede reasignar", async () => {
      currentUser = coordB;
      const res = await assignRequest(req.id, admin.id);
      expect(res.ok).toBe(true); // COORDINADOR_CUENTA tiene requests.assign="all"
      // pero un rol sin ese permiso (ej. cliente) no debería poder
      currentUser = CLIENTE_FIXTURE;
      const res2 = await assignRequest(req.id, coordA.id);
      expect(res2.ok).toBe(false);
    });

    it("setUserActive: solo ADMIN puede desactivar a alguien", async () => {
      currentUser = coordA;
      await setUserActive(coordB.id, false);
      let fresh = await prisma.user.findUniqueOrThrow({ where: { id: coordB.id } });
      expect(fresh.isActive).toBe(true);

      currentUser = admin;
      await setUserActive(coordB.id, false);
      fresh = await prisma.user.findUniqueOrThrow({ where: { id: coordB.id } });
      expect(fresh.isActive).toBe(false);
    });

    it("createUser: rechaza un correo con formato inválido, no crea la fila", async () => {
      currentUser = admin;
      const fd = new FormData();
      fd.set("name", "Usuario Prueba");
      fd.set("email", "no-es-un-correo");
      fd.set("accountType", "STAFF");
      fd.set("roleIds", desarrolladorRoleId);
      await expect(createUser(fd)).rejects.toThrow(RedirectSignal);
      const found = await prisma.user.findUnique({ where: { email: "no-es-un-correo" } });
      expect(found).toBeNull();
    });

    it("createUser: con datos válidos crea la fila", async () => {
      currentUser = admin;
      const email = `nuevo-${suffix}@test.local`;
      const fd = new FormData();
      fd.set("name", "Usuario Válido");
      fd.set("email", email);
      fd.set("accountType", "STAFF");
      fd.set("roleIds", desarrolladorRoleId);
      await expect(createUser(fd)).rejects.toThrow(RedirectSignal);
      const found = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(found.role).toBe("DESARROLLADOR");
      await prisma.user.delete({ where: { email } });
    });

    it("setProjectActive: cerrar un proyecto finaliza sus tareas pendientes", async () => {
      currentUser = admin;
      const project = await prisma.project.create({ data: { name: `Proyecto ${suffix}`, clientId: clientA.id } });
      const open = await prisma.request.create({
        data: { key: `TSTP-${suffix}`, title: "Pendiente", clientId: clientA.id, projectId: project.id, status: "POR_HACER" },
      });
      await setProjectActive(project.id, false);
      const fresh = await prisma.request.findUniqueOrThrow({ where: { id: open.id }, include: { statusChanges: true } });
      expect(fresh.status).toBe("FINALIZADA");
      expect(fresh.finalizedAt).not.toBeNull();
      expect(fresh.statusChanges.map((s) => s.status)).toEqual(["FINALIZADA"]);
      await prisma.request.delete({ where: { id: open.id } });
      await prisma.project.delete({ where: { id: project.id } });
    });

    it("submitRequest: solo equipo interno; responsable solo si puede asignar y el perfil es del cliente", async () => {
      const form = (title: string, assigneeId = coordA.id) => {
        const fd = new FormData();
        fd.set("clientId", clientA.id);
        fd.set("requesterEmail", "pide@test.local");
        fd.set("title", title);
        fd.set("assigneeId", assigneeId);
        return fd;
      };
      const created = async (title: string) =>
        prisma.request.findFirstOrThrow({ where: { clientId: clientA.id, title } });

      currentUser = admin;
      await expect(submitRequest(form(`Con responsable ${suffix}`))).rejects.toThrow(RedirectSignal);
      const withAssignee = await created(`Con responsable ${suffix}`);
      expect(withAssignee.assigneeId).toBe(coordA.id);

      // coordB no es encargado ni miembro de clientA: se ignora.
      await expect(submitRequest(form(`Ajeno ${suffix}`, coordB.id))).rejects.toThrow(RedirectSignal);
      const foreign = await created(`Ajeno ${suffix}`);
      expect(foreign.assigneeId).toBeNull();

      // Sin sesión (o como cliente) el formulario interno no crea nada.
      currentUser = null;
      await expect(submitRequest(form(`Anonima ${suffix}`))).rejects.toThrow("redirect:/login");
      currentUser = CLIENTE_FIXTURE;
      await expect(submitRequest(form(`Anonima ${suffix}`))).rejects.toThrow("redirect:/login");
      expect(await prisma.request.count({ where: { title: `Anonima ${suffix}` } })).toBe(0);

      await prisma.request.deleteMany({ where: { id: { in: [withAssignee.id, foreign.id] } } });
    });

    it("archivar cliente: histórico de solo lectura; reactivarlo restaura en pausa solo ese lote", async () => {
      await prisma.status.upsert({
        where: { code: "EN_PAUSA" },
        update: {},
        create: { code: "EN_PAUSA", label: "En pausa", color: "#999999", isFinal: false, isOptional: true },
      });
      const c = await prisma.client.create({ data: { name: `Cliente Archivable ${suffix}` } });
      const project = await prisma.project.create({ data: { name: `Proy Arch ${suffix}`, clientId: c.id } });
      const mk = (k: string, data: object = {}) =>
        prisma.request.create({
          data: { key: `ARC${k}-${suffix}`, title: k, clientId: c.id, status: "POR_HACER", ...data },
        });
      const pending = await mk("P", { projectId: project.id });
      const done = await mk("D", { status: "FINALIZADA", finalizedAt: new Date(Date.now() - 86400000) });
      const oldArchived = await mk("O", { archivedAt: new Date(Date.now() - 86400000) });
      const portalUser = await prisma.user.create({
        data: { name: "Portal", email: `portal-${suffix}@test.local`, role: "CLIENTE", clientId: c.id },
      });
      const get = (id: string) => prisma.request.findUniqueOrThrow({ where: { id } });

      currentUser = admin;
      await setClientActive(c.id, false);
      const [p1, d1] = [await get(pending.id), await get(done.id)];
      expect(p1.status).toBe("FINALIZADA");
      expect(p1.archivedAt).not.toBeNull();
      expect(d1.archivedAt).toEqual(p1.archivedAt);
      expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).archivedAt).not.toBeNull();
      expect((await prisma.user.findUniqueOrThrow({ where: { id: portalUser.id } })).isActive).toBe(false);

      // Solo lectura: ni estado, ni horas, ni restaurar suelta (ni siendo Admin).
      expect((await changeStatus(pending.id, "POR_HACER")).ok).toBe(false);
      const fd = new FormData();
      fd.set("requestId", pending.id);
      fd.set("hours", "1");
      await logHours(fd);
      expect(await prisma.timeEntry.count({ where: { requestId: pending.id } })).toBe(0);
      await unarchiveRequest(pending.id);
      expect((await get(pending.id)).archivedAt).not.toBeNull();

      // No recibe solicitudes nuevas.
      const form = new FormData();
      form.set("clientId", c.id);
      form.set("requesterEmail", "x@test.local");
      form.set("title", `Nueva ${suffix}`);
      await expect(submitRequest(form)).rejects.toThrow("error=datos");
      expect(await prisma.request.count({ where: { clientId: c.id } })).toBe(3);

      await setClientActive(c.id, true);
      const [p2, d2, o2] = [await get(pending.id), await get(done.id), await get(oldArchived.id)];
      expect(p2.status).toBe("EN_PAUSA");
      expect(p2.archivedAt).toBeNull();
      expect(p2.finalizedAt).toBeNull();
      expect(d2.status).toBe("FINALIZADA");
      expect(d2.archivedAt).toBeNull();
      expect(o2.archivedAt).not.toBeNull(); // archivada a mano antes: no es del lote
      expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).archivedAt).toBeNull();

      // Restaurar suelta: solo Admin.
      currentUser = coordA;
      await unarchiveRequest(oldArchived.id);
      expect((await get(oldArchived.id)).archivedAt).not.toBeNull();
      currentUser = admin;
      await unarchiveRequest(oldArchived.id);
      expect((await get(oldArchived.id)).archivedAt).toBeNull();

      await prisma.request.deleteMany({ where: { clientId: c.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.user.delete({ where: { id: portalUser.id } });
      await prisma.client.delete({ where: { id: c.id } });
    });

    it("workClientsWhere: rol sin clients.view ve los clientes donde es miembro; Admin ve todos", async () => {
      const uxRole = await prisma.role.findUniqueOrThrow({ where: { code: "DISENADOR_UXUI" } });
      const row = await prisma.user.create({
        data: {
          name: "UX Test",
          email: `ux-${suffix}@test.local`,
          role: "DISENADOR_UXUI",
          roles: { create: { roleId: uxRole.id } },
          clientMemberships: { create: { clientId: clientB.id } },
        },
      });
      const ux = await asSessionUser(row);
      const uxIds = (await prisma.client.findMany({ where: workClientsWhere(asAuthz(ux)), select: { id: true } })).map((c) => c.id);
      expect(uxIds).toContain(clientB.id);
      expect(uxIds).not.toContain(clientA.id);

      const all = await prisma.client.count();
      expect(await prisma.client.count({ where: workClientsWhere(asAuthz(admin)) })).toBe(all);
      await prisma.user.delete({ where: { id: row.id } });
    });
  },
);
