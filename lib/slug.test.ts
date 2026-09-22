import { describe, it, expect } from "vitest";
import { slugify, withSlug, idFromSlug, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("minúsculas, sin tildes, espacios a guiones", () => {
    expect(slugify("Clínica Los Coihues")).toBe("clinica-los-coihues");
  });

  it("colapsa símbolos y recorta guiones sobrantes", () => {
    expect(slugify("  ¡Hola!! Mundo_2026  ")).toBe("hola-mundo-2026");
  });
});

describe("withSlug / idFromSlug", () => {
  it("son inversas: extraer el id de un slug híbrido da el id original", () => {
    const id = "cmub8su900007l404jsi9krmo";
    expect(idFromSlug(withSlug(id, "Acme Corp"))).toBe(id);
  });

  it("un id sin slug (link viejo) se devuelve intacto", () => {
    expect(idFromSlug("cmub8su900007l404jsi9krmo")).toBe("cmub8su900007l404jsi9krmo");
  });
});

describe("uniqueSlug", () => {
  it("usa el slug base si está libre", async () => {
    expect(await uniqueSlug("Sitio Web", async () => false)).toBe("sitio-web");
  });

  it("agrega -2, -3... hasta encontrar uno libre", async () => {
    const taken = new Set(["sitio-web", "sitio-web-2", "sitio-web-3"]);
    expect(await uniqueSlug("Sitio Web", async (s) => taken.has(s))).toBe("sitio-web-4");
  });
});
