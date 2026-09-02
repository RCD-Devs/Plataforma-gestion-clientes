import { describe, it, expect } from "vitest";
import {
  slaDays,
  classifySla,
  mean,
  median,
  round1,
  monthKey,
  monthLabel,
  monthRange,
} from "./sla";

describe("slaDays", () => {
  it("calcula días entre creación y finalización", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    const finalized = new Date("2026-01-06T00:00:00Z");
    expect(slaDays(created, finalized)).toBe(5);
  });
});

describe("classifySla", () => {
  it("respeta los límites exactos de cada rango", () => {
    expect(classifySla(0)).toBe("OPTIMO");
    expect(classifySla(4)).toBe("OPTIMO");
    expect(classifySla(4.01)).toBe("ACEPTABLE");
    expect(classifySla(9)).toBe("ACEPTABLE");
    expect(classifySla(9.01)).toBe("ATENCION");
    expect(classifySla(14)).toBe("ATENCION");
    expect(classifySla(14.01)).toBe("CRITICO");
    expect(classifySla(100)).toBe("CRITICO");
  });
});

describe("mean", () => {
  it("da 0 para una lista vacía", () => {
    expect(mean([])).toBe(0);
  });
  it("promedia una lista normal", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("median", () => {
  it("da 0 para una lista vacía", () => {
    expect(median([])).toBe(0);
  });
  it("toma el del medio en listas impares", () => {
    expect(median([5, 1, 3])).toBe(3);
  });
  it("promedia los dos del medio en listas pares", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("no depende del orden de entrada", () => {
    expect(median([9, 1, 5, 3])).toBe(4);
  });
});

describe("round1", () => {
  it("redondea a un decimal", () => {
    expect(round1(2.34)).toBe(2.3);
    expect(round1(2.36)).toBe(2.4);
    expect(round1(2)).toBe(2);
  });
});

describe("monthKey / monthLabel", () => {
  it("arma la clave YYYY-MM y su etiqueta corta en español", () => {
    const d = new Date(2026, 8, 15); // septiembre
    expect(monthKey(d)).toBe("2026-09");
    expect(monthLabel("2026-09")).toBe("sep 26");
    expect(monthLabel("2026-01")).toBe("ene 26");
  });
});

describe("monthRange", () => {
  it("genera la secuencia inclusive de meses entre dos fechas", () => {
    const from = new Date(2025, 10, 20); // nov 2025
    const to = new Date(2026, 1, 5); // feb 2026
    expect(monthRange(from, to)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("da un solo mes cuando from y to caen en el mismo mes", () => {
    const d = new Date(2026, 5, 1);
    expect(monthRange(d, d)).toEqual(["2026-06"]);
  });
});
