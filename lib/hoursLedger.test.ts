import { describe, expect, it } from "vitest";
import { computeLedger, cycleGrants } from "./hoursLedger";

// Caso Habitat: 280h/mes, uso jun 52.8, jul 85.5, ago 58, sep 24.
const d = (s: string) => new Date(`${s}T12:00:00`);
const client = (carryoverMonths: number) => ({
  id: "h",
  contractedHours: 280,
  cycleMonths: 1,
  carryoverMonths,
  cycleStartDate: d("2026-06-01"),
  createdAt: d("2026-06-01"),
});
const timeEntries = [
  { hours: 52.8, date: d("2026-06-15") },
  { hours: 85.5, date: d("2026-07-15") },
  { hours: 58, date: d("2026-08-15") },
  { hours: 24, date: d("2026-09-15") },
];
const ledger = (carry: number) => {
  const asOf = d("2026-09-24");
  return computeLedger({ grants: cycleGrants(client(carry), asOf), adjustments: [], timeEntries, asOf });
};

describe("arrastre de horas sobrantes", () => {
  it("1 mes: sobrante de agosto + saldo de septiembre", () => {
    expect(ledger(1).available).toBeCloseTo(222 + 256);
  });
  it("2 meses: suma también el sobrante de julio", () => {
    expect(ledger(2).available).toBeCloseTo(194.5 + 222 + 256);
  });
  it("0 meses: solo el ciclo vigente", () => {
    expect(ledger(0).available).toBeCloseTo(256);
  });
  it("el exceso de un mes toma del arrastre, no genera extra", () => {
    const asOf = d("2026-07-24");
    const l = computeLedger({
      grants: cycleGrants(client(1), asOf),
      adjustments: [],
      timeEntries: [{ hours: 100, date: d("2026-06-10") }, { hours: 300, date: d("2026-07-10") }],
      asOf,
    });
    expect(l.extraHours).toBe(0);
    expect(l.available).toBeCloseTo(160); // 180 de junio - 20 de exceso de julio
  });
});
