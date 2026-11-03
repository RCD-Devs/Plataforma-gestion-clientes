import { describe, it, expect } from "vitest";
import { isoWeekday, monthBounds, planDays, nextFacilitators, timeForDay } from "./dailyRotation";
import { HOLIDAYS_CL } from "./holidaysCL";

describe("dailyRotation", () => {
  it("isoWeekday y monthBounds", () => {
    expect(isoWeekday("2026-11-02")).toBe(1); // lunes
    expect(isoWeekday("2026-11-08")).toBe(7); // domingo
    expect(monthBounds("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(monthBounds("2028-02").last).toBe("2028-02-29");
  });

  it("planDays: lunes/miércoles/viernes de diciembre 2026, con feriados marcados", () => {
    const days = planDays("2026-12-01", "2026-12-31", [1, 3, 5], HOLIDAYS_CL);
    expect(days.map((d) => d.key).slice(0, 3)).toEqual(["2026-12-02", "2026-12-04", "2026-12-07"]);
    expect(days.find((d) => d.key === "2026-12-25")?.holiday).toBe("Navidad");
    expect(days.filter((d) => d.holiday)).toHaveLength(1); // el 8 (martes) no cae en L/M/V
  });

  it("timeForDay: hora propia del día o la general", () => {
    const dayTimes = { "1": "09:30", "3": "10:00", "5": "25:00" };
    expect(timeForDay(dayTimes, "09:00", 1)).toBe("09:30");
    expect(timeForDay(dayTimes, "09:00", 3)).toBe("10:00");
    expect(timeForDay(dayTimes, "09:00", 5)).toBe("09:00"); // inválida → general
    expect(timeForDay(null, "09:00", 2)).toBe("09:00");
  });

  it("nextFacilitators sigue desde el último y da la vuelta", () => {
    expect(nextFacilitators(["a", "b", "c"], null, 4)).toEqual(["a", "b", "c", "a"]);
    expect(nextFacilitators(["a", "b", "c"], "b", 3)).toEqual(["c", "a", "b"]);
    expect(nextFacilitators(["a", "b", "c"], "zz", 2)).toEqual(["a", "b"]); // ya no está en el orden
    expect(nextFacilitators([], "a", 2)).toEqual([]);
  });
});
