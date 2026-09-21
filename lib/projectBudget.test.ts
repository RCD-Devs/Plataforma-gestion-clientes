import { describe, it, expect } from "vitest";
import { budgetStatus, stageDateIssue } from "./projectBudget";

const d = (s: string) => new Date(`${s}T00:00:00`);

describe("budgetStatus", () => {
  it("descuenta lo consumido del estimado", () => {
    const b = budgetStatus({ estimatedHours: 100, consumedHours: 40, startDate: null, endDate: null });
    expect(b.remainingHours).toBe(60);
    expect(b.redHours).toBe(0);
    expect(b.pctUsed).toBe(40);
  });

  it("pasarse del estimado deja horas en rojo y saldo 0", () => {
    const b = budgetStatus({ estimatedHours: 100, consumedHours: 130, startDate: null, endDate: null });
    expect(b.remainingHours).toBe(0);
    expect(b.redHours).toBe(30);
    expect(b.pctUsed).toBe(130);
  });

  it("sin horas estimadas no hay saldo ni rojo", () => {
    const b = budgetStatus({ estimatedHours: null, consumedHours: 50, startDate: null, endDate: null });
    expect(b.hasHours).toBe(false);
    expect(b.redHours).toBe(0);
  });

  it("cuenta días del 01/09 al 30/09 y el atraso después del término", () => {
    const base = { estimatedHours: null, consumedHours: 0, startDate: d("2026-09-01"), endDate: d("2026-09-30") };
    const mid = budgetStatus({ ...base, now: d("2026-09-10") });
    expect(mid.totalDays).toBe(30);
    expect(mid.elapsedDays).toBe(10);
    expect(mid.lateDays).toBe(0);
    const late = budgetStatus({ ...base, now: d("2026-10-05") });
    expect(late.elapsedDays).toBe(30);
    expect(late.lateDays).toBe(5);
    expect(budgetStatus({ ...base, now: d("2026-10-05"), done: true }).lateDays).toBe(0);
  });
});

describe("stageDateIssue", () => {
  const project = { startDate: d("2026-09-01"), endDate: d("2026-09-30") };
  it("acepta una etapa dentro del marco", () => {
    expect(stageDateIssue({ startDate: d("2026-09-05"), endDate: d("2026-09-20") }, project)).toBeNull();
  });
  it("rechaza etapas fuera del marco inicial", () => {
    expect(stageDateIssue({ startDate: d("2026-08-28"), endDate: d("2026-09-10") }, project)).toBe("fuera_marco");
    expect(stageDateIssue({ startDate: d("2026-09-20"), endDate: d("2026-10-02") }, project)).toBe("fuera_marco");
  });
  it("rechaza término anterior al inicio", () => {
    expect(stageDateIssue({ startDate: d("2026-09-20"), endDate: d("2026-09-10") }, project)).toBe("orden");
  });
  it("sin marco de proyecto no restringe", () => {
    expect(stageDateIssue({ startDate: d("2027-01-01"), endDate: d("2027-02-01") }, { startDate: null, endDate: null })).toBeNull();
  });
});
