import { describe, it, expect } from "vitest";
import { overlapsOf, weekRange } from "./scheduleBlocks";

const d = (s: string) => new Date(`2026-09-22T${s}:00`);

describe("overlapsOf", () => {
  const blocks = [
    { id: "a", start: d("09:00"), end: d("10:00") },
    { id: "b", start: d("11:00"), end: d("12:00") },
  ];

  it("detecta un bloque que se cruza parcialmente", () => {
    expect(overlapsOf(blocks, d("09:30"), d("10:30")).map((b) => b.id)).toEqual(["a"]);
  });

  it("no detecta bloques contiguos (fin = inicio del otro)", () => {
    expect(overlapsOf(blocks, d("10:00"), d("11:00"))).toHaveLength(0);
  });

  it("excluye el propio bloque al editarlo", () => {
    expect(overlapsOf(blocks, d("09:00"), d("10:00"), "a")).toHaveLength(0);
  });

  it("detecta un bloque que contiene completamente a otro", () => {
    expect(overlapsOf(blocks, d("08:00"), d("13:00")).map((b) => b.id)).toEqual(["a", "b"]);
  });
});

describe("weekRange", () => {
  it("2026-09-22 (martes) cae dentro de la semana que empieza el lunes 21", () => {
    const { start, end } = weekRange("2026-09-21");
    expect(start.getDay()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(27);
    expect(end.getHours()).toBe(23);
  });

  it("sin argumento retrocede al lunes de la fecha actual", () => {
    const { start } = weekRange();
    expect(start.getDay()).toBe(1);
    expect(start.getHours()).toBe(0);
  });
});
