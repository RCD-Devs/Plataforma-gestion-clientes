import { describe, it, expect } from "vitest";
import { codeFromName, uniqueClientCode } from "./clientCode";

describe("codeFromName", () => {
  it("una palabra: sus primeras 4 letras, mayúsculas, sin tildes", () => {
    expect(codeFromName("Kaufmann")).toBe("KAUF");
    expect(codeFromName("Salmón")).toBe("SALM");
  });

  it("varias palabras: iniciales", () => {
    expect(codeFromName("Jac Forklift")).toBe("JF");
    expect(codeFromName("Cimenta - Terrazas")).toBe("CT");
    expect(codeFromName("Casa & Ideas")).toBe("CI");
  });

  it("nombres ya cortos se mantienen intactos", () => {
    expect(codeFromName("NCA")).toBe("NCA");
    expect(codeFromName("ACHS")).toBe("ACHS");
  });
});

describe("uniqueClientCode", () => {
  it("usa el código base si está libre", async () => {
    expect(await uniqueClientCode("Kaufmann", async () => false)).toBe("KAUF");
  });

  it("agrega un número si choca", async () => {
    const taken = new Set(["KAUF", "KAUF2"]);
    expect(await uniqueClientCode("Kaufmann", async (c) => taken.has(c))).toBe("KAUF3");
  });

  it("nunca devuelve MBA (reservado para el historial previo)", async () => {
    expect(await uniqueClientCode("Mba", async () => false)).not.toBe("MBA");
  });
});
