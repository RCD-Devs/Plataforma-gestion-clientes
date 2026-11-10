import { describe, expect, it } from "vitest";
import { buildRows, continuaLabel, periodLabel, type ReportEntry } from "./dedicacion";

it("continuaLabel y periodLabel", () => {
  expect(continuaLabel(["Experiencia Digital", "Contenidos"])).toBe("Continuidad");
  expect(continuaLabel(["Contenidos"])).toBe("Rompecabeza Contenidos");
  expect(continuaLabel([])).toBeNull();
  expect(periodLabel("2026-10")).toBe("oct 2026");
});

describe("buildRows", () => {
  const base: ReportEntry = {
    month: "2026-11", clientId: "jac", userId: "alexis", hours: 5, servicio: "Web", continua: "Continuidad",
  };
  const people = new Map([["alexis", "Contreras Alexis"]]);
  const clients = new Map([["jac", "Jacforklift"]]);

  it("suma en una fila, separa si cambia el servicio, usa el nombre de reporte", () => {
    const rows = buildRows({
      entries: [base, { ...base, hours: 6 }, { ...base, hours: 2, servicio: "RRSS" }],
      people,
      clients,
    });
    expect(rows).toEqual([
      ["nov 2026", "Rompecabeza", "Jacforklift", "Continuidad", "Experiencia Digital", "Web", 11, "Contreras Alexis"],
      ["nov 2026", "Rompecabeza", "Jacforklift", "Continuidad", "Experiencia Digital", "RRSS", 2, "Contreras Alexis"],
    ]);
  });
});
