// Planificación de dailys (etapa 2): qué fechas tocan y quién lidera cada
// una. Puro (sin db) para poder testearlo; trabaja con claves "YYYY-MM-DD".
import { addDaysKey } from "./followUps";

// 1 = lunes … 7 = domingo.
export function isoWeekday(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay() || 7;
}

export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first: `${month}-01`, last };
}

export type PlannedDay = { key: string; holiday: string | null };

// Fechas entre from y to (inclusive) que caen en los días elegidos;
// marca las que son feriado (se crean canceladas, no consumen turno).
export function planDays(fromKey: string, toKey: string, weekdays: number[], holidays: Record<string, string>): PlannedDay[] {
  const out: PlannedDay[] = [];
  for (let k = fromKey; k <= toKey; k = addDaysKey(k, 1)) {
    if (weekdays.includes(isoWeekday(k))) out.push({ key: k, holiday: holidays[k] ?? null });
  }
  return out;
}

// Los próximos n turnos siguiendo el orden, partiendo después de quien
// lideró la última vez (así la carga queda pareja entre meses). Si esa
// persona ya no está en el orden, parte desde el primero.
export function nextFacilitators(order: string[], lastId: string | null, n: number): string[] {
  if (order.length === 0) return [];
  const start = lastId ? order.indexOf(lastId) + 1 : 0;
  return Array.from({ length: n }, (_, i) => order[(start + i) % order.length]);
}
