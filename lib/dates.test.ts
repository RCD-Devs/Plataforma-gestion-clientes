import { describe, it, expect } from "vitest";
import { daysFromToday, toDateInput, mondayOf, endOfToday, zonedTimeToUtc, DAY } from "./dates";

// Formatea un instante en America/Santiago como "YYYY-MM-DDTHH:mm", para
// comprobar la ida y vuelta sin asumir a mano el desfase de Chile (varía
// con el horario de verano).
function formatSantiago(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Santiago",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  const hour = p.hour === "24" ? "00" : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`;
}

describe("zonedTimeToUtc", () => {
  it("la hora de pared en Santiago, al formatearla de vuelta, coincide con la original", () => {
    for (const wallClock of ["2026-01-15T15:00", "2026-07-15T15:00", "2026-09-22T15:00", "2026-12-31T23:30"]) {
      const utc = zonedTimeToUtc(wallClock)!;
      expect(formatSantiago(utc)).toBe(wallClock);
    }
  });

  it("Santiago va detrás de UTC (el instante UTC cae después en el reloj)", () => {
    const utc = zonedTimeToUtc("2026-09-22T15:00")!;
    // 15:00 hora Chile es más tarde que 15:00 UTC del mismo día.
    expect(utc.getTime()).toBeGreaterThan(Date.UTC(2026, 8, 22, 15, 0));
  });

  it("formato inválido devuelve null", () => {
    expect(zonedTimeToUtc("2026-09-22")).toBeNull();
    expect(zonedTimeToUtc("no es una fecha")).toBeNull();
  });
});

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
