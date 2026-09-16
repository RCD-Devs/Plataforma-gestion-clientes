import { describe, it, expect } from "vitest";
import {
  isTeamRole,
  isManager,
  canActOnRequest,
  requestVisibilityWhere,
  clientVisibilityWhere,
} from "./authz";

const admin = { id: "u-admin", role: "ADMIN" };
const lider = { id: "u-lider", role: "LIDER_AREA" };
const coordinador = { id: "u-coord", role: "COORDINADOR_CUENTA" };
const disenador = { id: "u-diseno", role: "DISENADOR_UXUI" };
const cliente = { id: "u-cliente", role: "CLIENTE" };

const reqAsignadaADisenador = {
  assigneeId: disenador.id,
  client: { accountManagerId: coordinador.id },
  collaborators: [] as { userId: string }[],
};

describe("isTeamRole / isManager", () => {
  it("solo los roles internos cuentan como equipo", () => {
    expect(isTeamRole("ADMIN")).toBe(true);
    expect(isTeamRole("DESARROLLADOR")).toBe(true);
    expect(isTeamRole("CLIENTE")).toBe(false);
  });

  it("solo Admin/Líder/Coordinador son manager", () => {
    expect(isManager("ADMIN")).toBe(true);
    expect(isManager("COORDINADOR_CUENTA")).toBe(true);
    expect(isManager("DISENADOR_UXUI")).toBe(false);
    expect(isManager("CLIENTE")).toBe(false);
  });
});

describe("canActOnRequest", () => {
  it("Admin y Líder de área pueden actuar sobre cualquier solicitud", () => {
    expect(canActOnRequest(admin, reqAsignadaADisenador)).toBe(true);
    expect(canActOnRequest(lider, reqAsignadaADisenador)).toBe(true);
  });

  it("Coordinador de cuenta solo sobre solicitudes de sus propios clientes", () => {
    expect(canActOnRequest(coordinador, reqAsignadaADisenador)).toBe(true);
    const deOtroCliente = {
      ...reqAsignadaADisenador,
      client: { accountManagerId: "otro-coordinador" },
    };
    expect(canActOnRequest(coordinador, deOtroCliente)).toBe(false);
  });

  it("Diseño/SEO/Desarrollo solo sobre lo asignado o donde colabora", () => {
    expect(canActOnRequest(disenador, reqAsignadaADisenador)).toBe(true);

    const noAsignadaAEl = { ...reqAsignadaADisenador, assigneeId: "otro-user" };
    expect(canActOnRequest(disenador, noAsignadaAEl)).toBe(false);

    const comoColaborador = {
      ...noAsignadaAEl,
      collaborators: [{ userId: disenador.id }],
    };
    expect(canActOnRequest(disenador, comoColaborador)).toBe(true);
  });

  it("un Cliente nunca puede actuar sobre una solicitud por esta vía", () => {
    expect(canActOnRequest(cliente, reqAsignadaADisenador)).toBe(false);
  });
});

describe("requestVisibilityWhere", () => {
  it("Admin/Líder no tienen restricción (objeto vacío)", () => {
    expect(requestVisibilityWhere(admin)).toEqual({});
    expect(requestVisibilityWhere(lider)).toEqual({});
  });

  it("Coordinador se filtra por sus clientes", () => {
    expect(requestVisibilityWhere(coordinador)).toEqual({
      client: { accountManagerId: coordinador.id },
    });
  });

  it("un rol que no es de equipo no ve nada por esta vía", () => {
    expect(requestVisibilityWhere(cliente)).toEqual({ id: "__ninguna__" });
  });
});

describe("clientVisibilityWhere", () => {
  it("Coordinador solo ve sus clientes, el resto de roles ve todos", () => {
    expect(clientVisibilityWhere(coordinador)).toEqual({
      accountManagerId: coordinador.id,
    });
    expect(clientVisibilityWhere(admin)).toEqual({});
  });
});
