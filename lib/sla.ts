// Cálculo de SLA para el reporte por cliente.
// SLA = fecha de finalización − fecha de ingreso, en días.
// Rangos alineados al panel de referencia: Óptimo 0-4d, Aceptable 5-9d,
// Atención 10-14d, Crítico 15+d.

export type SlaRange = "OPTIMO" | "ACEPTABLE" | "ATENCION" | "CRITICO";

export const SLA_RANGES: { key: SlaRange; label: string; color: string; max: number }[] = [
  { key: "OPTIMO", label: "0-4d Óptimo", color: "#0e9f6e", max: 4 },
  { key: "ACEPTABLE", label: "5-9d Aceptable", color: "#c97416", max: 9 },
  { key: "ATENCION", label: "10-14d Atención", color: "#e2532a", max: 14 },
  { key: "CRITICO", label: "15+d Crítico", color: "#d21f3c", max: Infinity },
];

export function slaDays(createdAt: Date, finalizedAt: Date): number {
  return (finalizedAt.getTime() - createdAt.getTime()) / 86400000;
}

export function classifySla(days: number): SlaRange {
  if (days <= 4) return "OPTIMO";
  if (days <= 9) return "ACEPTABLE";
  if (days <= 14) return "ATENCION";
  return "CRITICO";
}

export function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// "YYYY-MM" → etiqueta corta "ene 26"
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_LABELS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_LABELS[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

// Genera la secuencia de claves de mes entre dos fechas (inclusive).
export function monthRange(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cur <= end) {
    keys.push(monthKey(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}
