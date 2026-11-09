import { describe, expect, it } from "vitest";
import { buildRows, continuaLabel, periodLabel, spreadByMonth, workHoursByMonth, type ReportEntry } from "./dedicacion";

describe("workHoursByMonth / spreadByMonth", () => {
  it("lun–jue 8,5 h, vie 6 h, sin fin de semana", () => {
    // lun 2 nov a dom 8 nov 2026: 4 × 8,5 + 6 = 40
    expect(workHoursByMonth("2026-11-02", "2026-11-08")).toEqual(new Map([["2026-11", 40]]));
  });
  it("salta feriados", () => {
    // 31 oct 2026 es sábado; 1 nov domingo → probamos 2026-12-08 (martes, feriado)
    expect(workHoursByMonth("2026-12-08", "2026-12-08").size).toBe(0);
  });
  it("reparte proporcional a horas hábiles", () => {
    // vie 30 oct (6 h) + lun 2 nov (8,5 h): 29 h → 12 / 17
    const m = spreadByMonth(29, "2026-10-30", "2026-11-02");
    expect(m.get("2026-10")).toBeCloseTo(12);
    expect(m.get("2026-11")).toBeCloseTo(17);
  });
});

it("continuaLabel y periodLabel", () => {
  expect(continuaLabel(["Experiencia Digital", "Contenidos"])).toBe("Continuidad");
  expect(continuaLabel(["Contenidos"])).toBe("Rompecabeza Contenidos");
  expect(continuaLabel([])).toBeNull();
  expect(periodLabel("2026-10")).toBe("oct 2026");
});

describe("buildRows", () => {
  const base: ReportEntry = {
    month: "2026-11", dayKey: "2026-11-02", clientId: "jac", userId: "alexis", hours: 5,
    perfil: "FullStack", seniority: 1, servicio: "Web", continua: "Continuidad",
  };
  const people = new Map([
    ["alexis", { nombre: "Contreras Alexis", perfil: "FullStack", seniority: 1.5 }],
    ["juan", { nombre: "Pérez Juan", perfil: "Dev", seniority: 1 }],
  ]);
  const clients = new Map([["jac", { name: "JAC", servicio: "Web", continua: "Continuidad" }]]);

  it("suma en una fila; separa si cambia el seniority; vendida a la más reciente; vendida sola usa valores actuales", () => {
    const rows = buildRows({
      entries: [
        base,
        { ...base, dayKey: "2026-11-03", hours: 6 },
        { ...base, dayKey: "2026-11-20", hours: 2, seniority: 1.5 },
      ],
      sold: new Map([
        ["2026-11|jac|alexis", 40],
        ["2026-11|jac|juan", 10],
      ]),
      people,
      clients,
    });
    expect(rows).toEqual([
      ["nov 2026", "Rompecabeza", "JAC", "Continuidad", "Experiencia Digital", "FullStack", 1, "Web", "", 11, "Contreras Alexis"],
      ["nov 2026", "Rompecabeza", "JAC", "Continuidad", "Experiencia Digital", "FullStack", 1.5, "Web", 40, 2, "Contreras Alexis"],
      ["nov 2026", "Rompecabeza", "JAC", "Continuidad", "Experiencia Digital", "Dev", 1, "Web", 10, "", "Pérez Juan"],
    ]);
  });
});
