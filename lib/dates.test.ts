import { describe, it, expect } from "vitest";
import { daysFromToday, toDateInput, mondayOf, endOfToday, DAY } from "./dates";

describe("daysFromToday", () => {
  it("da 0 para hoy, sin importar la hora del día", () => {
    const now = new Date();
    const morning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 1);
    const night = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
    expect(daysFromToday(morning)).toBe(0);
    expect(daysFromToday(night)).toBe(0);
  });

  it("da positivo para fechas futuras y negativo para vencidas", () => {
    expect(daysFromToday(new Date(Date.now() + 3 * DAY))).toBe(3);
    expect(daysFromToday(new Date(Date.now() - 5 * DAY))).toBe(-5);
  });
});

describe("toDateInput", () => {
  it("formatea YYYY-MM-DD con ceros a la izquierda", () => {
    expect(toDateInput(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toDateInput(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("mondayOf", () => {
  it("devuelve el mismo lunes para cualquier día de esa semana", () => {
    // Semana del lunes 2026-08-31 (lunes) al domingo 2026-09-06.
    const monday = "2026-08-31";
    expect(toDateInput(new Date(2026, 7, 31))).toBe(monday); // lunes
    expect(mondayOf(new Date(2026, 7, 31))).toBe(monday);
    expect(mondayOf(new Date(2026, 8, 2))).toBe(monday); // miércoles
    expect(mondayOf(new Date(2026, 8, 6))).toBe(monday); // domingo
  });

  it("cruza de mes/año correctamente", () => {
    // 2026-01-01 es jueves → el lunes de esa semana es 2025-12-29.
    expect(mondayOf(new Date(2026, 0, 1))).toBe("2025-12-29");
  });
});

describe("endOfToday", () => {
  it("queda en 23:59:59.999 del día de hoy", () => {
    const end = endOfToday();
    const now = new Date();
    expect(end.getFullYear()).toBe(now.getFullYear());
    expect(end.getMonth()).toBe(now.getMonth());
    expect(end.getDate()).toBe(now.getDate());
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });
});
