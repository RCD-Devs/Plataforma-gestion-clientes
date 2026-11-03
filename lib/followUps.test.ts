import { describe, it, expect } from "vitest";
import { addDaysKey, followUpBucket, isDateKey, dueLabel, daysToNextMonday } from "./followUps";

describe("followUps", () => {
  it("addDaysKey cruza mes, año y bisiesto", () => {
    expect(addDaysKey("2026-11-03", 1)).toBe("2026-11-04");
    expect(addDaysKey("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysKey("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDaysKey("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("followUpBucket", () => {
    expect(followUpBucket("2026-11-02", "2026-11-03")).toBe("late");
    expect(followUpBucket("2026-11-03", "2026-11-03")).toBe("today");
    expect(followUpBucket("2026-11-04", "2026-11-03")).toBe("upcoming");
  });

  it("isDateKey rechaza formatos y fechas inexistentes", () => {
    expect(isDateKey("2026-11-03")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("03-11-2026")).toBe(false);
    expect(isDateKey("")).toBe(false);
  });

  it("dueLabel en lenguaje natural", () => {
    const today = "2026-11-03"; // martes
    expect(dueLabel("2026-11-03", today)).toBe("Hoy");
    expect(dueLabel("2026-11-04", today)).toBe("Mañana");
    expect(dueLabel("2026-11-06", today)).toBe("viernes");
    expect(dueLabel("2026-11-02", today)).toBe("Venció ayer");
    expect(dueLabel("2026-10-31", today)).toBe("Venció hace 3 días");
    expect(dueLabel("2026-11-20", today)).toMatch(/^20 nov/);
  });

  it("daysToNextMonday", () => {
    expect(daysToNextMonday("2026-11-03")).toBe(6); // martes → lunes 9
    expect(daysToNextMonday("2026-11-08")).toBe(1); // domingo
    expect(daysToNextMonday("2026-11-09")).toBe(7); // lunes → el siguiente
  });
});
