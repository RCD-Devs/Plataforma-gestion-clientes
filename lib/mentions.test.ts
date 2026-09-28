import { describe, expect, it } from "vitest";
import { mentionQuery } from "./mentions";

const at = (s: string) => mentionQuery(s, s.length);

describe("mentionQuery", () => {
  it("detecta @ al inicio o tras un espacio", () => {
    expect(at("@ale")).toEqual({ query: "ale", start: 0 });
    expect(at("hola @Ale")).toEqual({ query: "Ale", start: 5 });
    expect(at("hola @")).toEqual({ query: "", start: 5 });
  });
  it("no abre el menú en un correo ni tras terminar la palabra", () => {
    expect(at("escribe a x@revo.cl")).toBeNull();
    expect(at("@ale ")).toBeNull();
  });
  it("mira solo hasta el cursor", () => {
    expect(mentionQuery("@ale y más texto", 4)).toEqual({ query: "ale", start: 0 });
  });
});
