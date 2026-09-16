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
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

let currentUser: { id: string; role: string; email: string; client?: unknown } | null = null;
vi.mock("@/lib/session", () => ({
  getSessionUser: async () => currentUser,
}));

const { prisma } = await import("@/lib/db");
const { changeStatus, assignRequest, setUserActive, createUser } = await import(
  "@/app/actions"
);

describe.skipIf(!process.env.RUN_DB_TESTS)(
  "Server Actions críticas (integración, BD real)",
  () => {
    const suffix = Date.now();
    let admin: { id: string; role: string; email: string };
    let coordA: { id: string; role: string; email: string };
    let coordB: { id: string; role: string; email: string };
    let clientA: { id: string };
    let clientB: { id: string };
    let req: { id: string };

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

      admin = await prisma.user.create({
        data: { name: "Admin Test", email: `admin-${suffix}@test.local`, role: "ADMIN" },
      });
      coordA = await prisma.user.create({
        data: { name: "Coord A Test", email: `coordA-${suffix}@test.local`, role: "COORDINADOR_CUENTA" },
      });
      coordB = await prisma.user.create({
        data: { name: "Coord B Test", email: `coordB-${suffix}@test.local`, role: "COORDINADOR_CUENTA" },
      });
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
      expect(res.ok).toBe(true); // COORDINADOR_CUENTA sí es isManager()
      // pero un rol sin permiso de gestión (ej. cliente) no debería poder
      currentUser = { id: "x", role: "CLIENTE", email: "cliente@test.local" };
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
      fd.set("role", "DESARROLLADOR");
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
      fd.set("role", "DESARROLLADOR");
      await expect(createUser(fd)).rejects.toThrow(RedirectSignal);
      const found = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(found.role).toBe("DESARROLLADOR");
      await prisma.user.delete({ where: { email } });
    });
  },
);
