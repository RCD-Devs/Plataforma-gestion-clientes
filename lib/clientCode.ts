// Código corto de un cliente ("ACHS", "JF"...), prefijo de sus folios
// (ACHS-1, ACHS-2...). Si el nombre es una sola palabra, sus primeras 4
// letras; si son varias, las iniciales. Único: si choca, se le agrega un
// número (ACHS2, ACHS3...).
//
// "MBA" queda reservado: es el prefijo fijo que usaba TODO folio antes de
// este cambio (nextKey() lo tenía escrito a mano, sin relación con ningún
// cliente) — no debe asignarse de nuevo a un cliente real, para no
// mezclar su historial con el de la bolsa de mantención general.
const RESERVED = new Set(["MBA"]);

export function codeFromName(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tildes
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "CLI";
  const base = words.length === 1 ? words[0].slice(0, 4) : words.map((w) => w[0]).join("").slice(0, 6);
  return base || "CLI";
}

export async function uniqueClientCode(name: string, exists: (code: string) => Promise<boolean>): Promise<string> {
  const root = codeFromName(name);
  let code = root;
  let n = 2;
  while (RESERVED.has(code) || (await exists(code))) code = `${root}${n++}`;
  return code;
}
