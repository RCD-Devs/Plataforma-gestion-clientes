import { describe, it, expect } from "vitest";
import { lastMondays } from "./personalDashboard";

describe("lastMondays", () => {
  it("da N lunes consecutivos, el más antiguo primero, terminando en la semana de hoy", () => {
    // 2026-09-22 es martes → lunes de esa semana es 2026-09-21.
    const today = new Date(2026, 8, 22);
    const weeks = lastMondays(4, today);
    expect(weeks).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"]);
  });

  it("cruza de mes correctamente", () => {
    // 2026-01-01 es jueves → lunes de esa semana es 2025-12-29.
    const weeks = lastMondays(2, new Date(2026, 0, 1));
    expect(weeks).toEqual(["2025-12-22", "2025-12-29"]);
  });
});
