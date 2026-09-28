// Ningún componente de cliente puede arrastrar lib/db (Prisma) al bundle
// del navegador: con el cliente extendido de lib/db.ts eso tumbaba la app
// entera al cargar (28 sep 2026). Recorre los imports de valor (no
// `import type`) desde cada archivo "use client" y falla si llega a lib/db.
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, dirname, resolve, relative } from "path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const DB = resolve(ROOT, "lib/db.ts");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? join(dirname(from), spec) : null;
  if (!base) return null; // paquete npm
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return resolve(c);
  }
  return null;
}

function valueImports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const specs: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?[^'"]*?from\s+["']([^"']+)["']/gm;
  for (const m of src.matchAll(re)) if (!m[2]) specs.push(m[3]);
  for (const m of src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) specs.push(m[1]);
  return specs.map((s) => resolveImport(file, s)).filter((p): p is string => !!p);
}

// Server Actions ("use server") cruzan al cliente como referencias RPC, no
// como código: no se sigue dentro de ellas.
const isServerActions = (f: string) => /^\s*["']use server["']/.test(readFileSync(f, "utf8"));

describe("bundle del navegador", () => {
  it("ningún componente de cliente importa (ni indirectamente) lib/db", () => {
    const clientFiles = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))].filter((f) =>
      /^\s*["']use client["']/.test(readFileSync(f, "utf8")),
    );
    const offenders: string[] = [];
    for (const start of clientFiles) {
      const seen = new Map<string, string | null>([[resolve(start), null]]);
      const queue = [resolve(start)];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const dep of valueImports(cur)) {
          if (seen.has(dep) || isServerActions(dep)) continue;
          seen.set(dep, cur);
          if (dep === DB) {
            const chain = [dep];
            for (let p = seen.get(dep); p; p = seen.get(p) ?? null) chain.unshift(p);
            offenders.push(chain.map((c) => relative(ROOT, c)).join(" → "));
          } else queue.push(dep);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
