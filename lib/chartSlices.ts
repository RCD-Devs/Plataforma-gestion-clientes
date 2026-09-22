// Utilidad pura para donuts (sin hooks, sin nada de navegador) — vive
// fuera de components/Charts.tsx a propósito: ese archivo tiene "use
// client" (por los useState de los gráficos), y eso convierte TODO lo que
// exporta en "solo cliente". Un Server Component puede renderizar
// <DonutChart> pero no puede *llamar* a toSlices() como función normal —
// eso tronaba con "Attempted to call toSlices() from the server".
export type Slice = { label: string; value: number; color: string; href?: string };

export const PALETTE = ["#0bdbcf", "#081826", "#fb693b", "#7c5cff", "#fda565", "#08a89f", "#c97416", "#d21f3c"];
export const OTHER_COLOR = "#c9d1d9";

// Top N + "Otras" agrupando el resto, con colores de la paleta — para
// cualquier donut de "¿en qué se fue X?" (horas por cliente, por tarea…).
export function toSlices(rows: { label: string; value: number; href?: string }[], max = 6): Slice[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, max).map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length] }));
  const rest = sorted.slice(max).reduce((a, r) => a + r.value, 0);
  return rest > 0 ? [...head, { label: "Otras", value: rest, color: OTHER_COLOR }] : head;
}
