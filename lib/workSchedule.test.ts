import { describe, expect, it } from "vitest";
import {
  calendarDays,
  expectedHours,
  extraHours,
  parseWorkHours,
  shiftMonth,
  DEFAULT_WORK_HOURS,
} from "./workSchedule";

describe("calendarDays", () => {
  it("día: solo esa fecha", () => {
    expect(calendarDays("dia", "2026-09-24")).toEqual(["2026-09-24"]);
  });

  it("semana: lunes a domingo aunque la fecha sea domingo", () => {
    const days = calendarDays("semana", "2026-09-27");
    expect(days[0]).toBe("2026-09-21");
    expect(days[6]).toBe("2026-09-27");
  });

  it("mes: semanas completas que cubren todo el mes (cruza cambio de hora)", () => {
    const days = calendarDays("mes", "2026-09-15");
    expect(days[0]).toBe("2026-08-31"); // lunes
    expect(days.at(-1)).toBe("2026-10-04"); // domingo
    expect(days.length % 7).toBe(0);
    expect(new Set(days).size).toBe(days.length);
  });
});

it("shiftMonth cae siempre en el día 1", () => {
  expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-01");
  expect(shiftMonth("2026-01-15", -1)).toBe("2025-12-01");
});

it("jornada: default, esperado por día y horas extra", () => {
  expect(parseWorkHours(null)).toEqual(DEFAULT_WORK_HOURS);
  expect(parseWorkHours([8, 8, 8, 8, 8, -1, "x"])).toEqual([8, 8, 8, 8, 8, 0, 0]);
  expect(expectedHours(DEFAULT_WORK_HOURS, "2026-09-24")).toBe(8.5); // jueves
  expect(expectedHours(DEFAULT_WORK_HOURS, "2026-09-25")).toBe(6); // viernes
  expect(expectedHours(DEFAULT_WORK_HOURS, "2026-09-26")).toBe(0); // sábado
  expect(extraHours(9.5, 8.5)).toBe(1);
  expect(extraHours(5, 6)).toBe(0);
  expect(extraHours(1, 0)).toBe(1);
});
