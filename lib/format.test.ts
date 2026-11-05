import { describe, expect, it } from "vitest";
import { durationToMinutes } from "./format";

describe("durationToMinutes", () => {
  it("convierte minutos y horas a minutos enteros", () => {
    expect(durationToMinutes("16", "min")).toBe(16);
    expect(durationToMinutes("1.5", "h")).toBe(90);
    expect(durationToMinutes("0.25", "h")).toBe(15);
  });

  it("acepta menos de un día y rechaza desde las 24 horas", () => {
    expect(durationToMinutes("1439", "min")).toBe(1439);
    expect(durationToMinutes("1440", "min")).toBeNull();
    expect(durationToMinutes("24", "h")).toBeNull();
  });

  it("rechaza valores vacíos, no numéricos, cero o negativos y unidades desconocidas", () => {
    for (const value of ["", "abc", "0", "-5", "Infinity"]) {
      expect(durationToMinutes(value, "h")).toBeNull();
    }
    expect(durationToMinutes("0.1", "min")).toBeNull(); // redondea a 0
    expect(durationToMinutes("5", "dias")).toBeNull();
  });
});
