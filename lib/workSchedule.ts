// Calendario personal: rango de días por vista (día/semana/mes) y jornada
// laboral (horas netas esperadas por día) para comparar con lo registrado.
// Las fechas viajan como "YYYY-MM-DD"; la aritmética se hace a mediodía UTC
// para que ni la zona del servidor ni el cambio de hora corran un día.

export type CalendarView = "dia" | "semana" | "mes";

// Lun..Dom. Por defecto: lun–jue 09:00–18:30 y vie 09:00–16:00, menos 1 h
// de colación.
export const DEFAULT_WORK_HOURS = [8.5, 8.5, 8.5, 8.5, 6, 0, 0];
export const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const fromKey = (s: string) => new Date(`${s}T12:00:00Z`);
const toKey = (d: Date) => d.toISOString().slice(0, 10);

export function shiftKey(s: string, days: number): string {
  const d = fromKey(s);
  d.setUTCDate(d.getUTCDate() + days);
  return toKey(d);
}

export function shiftMonth(s: string, months: number): string {
  const d = fromKey(s);
  return toKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12)));
}

// 0 = lunes … 6 = domingo.
export function weekdayIndex(s: string): number {
  return (fromKey(s).getUTCDay() + 6) % 7;
}

const mondayKey = (s: string) => shiftKey(s, -weekdayIndex(s));

// Días que muestra cada vista. El mes se completa a semanas enteras
// (lunes a domingo) para armar la grilla.
export function calendarDays(view: CalendarView, date: string): string[] {
  if (view === "dia") return [date];
  if (view === "semana") return Array.from({ length: 7 }, (_, i) => shiftKey(mondayKey(date), i));
  const first = date.slice(0, 8) + "01";
  const last = shiftKey(shiftMonth(first, 1), -1);
  const days: string[] = [];
  for (let d = mondayKey(first); d <= last || weekdayIndex(d) !== 0; d = shiftKey(d, 1)) days.push(d);
  return days;
}

// Lo guardado en User.workHours (Json) → 7 números válidos, o el default.
export function parseWorkHours(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length !== 7) return DEFAULT_WORK_HOURS;
  return raw.map((h) => (typeof h === "number" && h >= 0 && h <= 24 ? h : 0));
}

export function expectedHours(workHours: number[], date: string): number {
  return workHours[weekdayIndex(date)] ?? 0;
}

export function extraHours(registered: number, expected: number): number {
  return Math.max(0, Math.round((registered - expected) * 100) / 100);
}
