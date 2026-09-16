import { describe, it, expect } from "vitest";
import { isTeamRole, isManager, canActOnRequest, requestVisibilityWhere, clientVisibilityWhere } from "./authz";
import type { Capabilities } from "./permissions";

// Mismas capacidades que scripts/seed-roles.ts otorga por defecto a cada
// rol — un test unitario no toca la base, así que se fabrican acá en vez
// de leer de Role/RolePermission real.
const capsAdmin: Capabilities = {
  "requests.access": ["all"],
  "clients.view": ["all"],
};
const capsLider: Capabilities = {
  "requests.access": ["all"],
  "clients.view": ["all"],
};
const capsCoordinador: Capabilities = {
  "requests.access": ["own_clients"],
  "clients.view": ["own_clients"],
};
const capsDisenador: Capabilities = {
  "requests.access": ["assigned"],
};
const capsCliente: Capabilities = {};

const admin = { id: "u-admin", capabilities: capsAdmin };
const lider = { id: "u-lider", capabilities: capsLider };
const coordinador = { id: "u-coord", capabilities: capsCoordinador };
const disenador = { id: "u-diseno", capabilities: capsDisenador };
const cliente = { id: "u-cliente", capabilities: capsCliente };

const reqAsignadaADisenador = {
  assigneeId: disenador.id,
  client: { accountManagerId: coordinador.id },
  collaborators: [] as { userId: string }[],
};

describe("isTeamRole / isManager", () => {
  it("solo CLIENTE queda fuera del equipo interno", () => {
    expect(isTeamRole("ADMIN")).toBe(true);
    expect(isTeamRole("DESARROLLADOR")).toBe(true);
    expect(isTeamRole("CLIENTE")).toBe(false);
  });

  it("manager es quien tiene clients.view otorgado", () => {
    expect(isManager(admin)).toBe(true);
    expect(isManager(coordinador)).toBe(true);
    expect(isManager(disenador)).toBe(false);
    expect(isManager(cliente)).toBe(false);
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

  it("un Cliente (sin capacidades de equipo) nunca puede actuar por esta vía", () => {
    expect(canActOnRequest(cliente, reqAsignadaADisenador)).toBe(false);
  });

  it("varios roles con distinto alcance se unen (no se pisan)", () => {
    const conDosRoles: { id: string; capabilities: Capabilities } = {
      id: "u-multi",
      capabilities: { "requests.access": ["own_clients", "assigned"] },
    };
    // Ve la de un cliente que él mismo gestiona, aunque no esté asignado...
    const deSuPropioCliente = {
      ...reqAsignadaADisenador,
      client: { accountManagerId: "u-multi" },
    };
    expect(canActOnRequest(conDosRoles, deSuPropioCliente)).toBe(true);
    // ...y también vería una asignada a él en un cliente ajeno.
    const asignadaAElOtroCliente = {
      assigneeId: "u-multi",
      client: { accountManagerId: "otro" },
      collaborators: [],
    };
    expect(canActOnRequest(conDosRoles, asignadaAElOtroCliente)).toBe(true);
  });
});

describe("requestVisibilityWhere", () => {
  it("Admin/Líder no tienen restricción (objeto vacío)", () => {
    expect(requestVisibilityWhere(admin)).toEqual({});
    expect(requestVisibilityWhere(lider)).toEqual({});
  });

  it("Coordinador se filtra por sus clientes", () => {
    expect(requestVisibilityWhere(coordinador)).toEqual({
      OR: [{ client: { accountManagerId: coordinador.id } }],
    });
  });

  it("sin la capacidad otorgada no se ve nada por esta vía", () => {
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
