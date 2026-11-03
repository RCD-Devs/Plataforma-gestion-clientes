// Seguimientos: cálculos de fecha sobre claves "YYYY-MM-DD" del día en
// Chile (chileDateKey) — así da igual que el proceso corra en UTC
// (Vercel) o en hora local. Sin imports de db: lo puede usar cualquiera.

export type FollowUpBucket = "late" | "today" | "upcoming";

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function followUpBucket(dueKey: string, todayKey: string): FollowUpBucket {
  return dueKey < todayKey ? "late" : dueKey === todayKey ? "today" : "upcoming";
}

export function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && addDaysKey(s, 0) === s;
}

const keyDate = (key: string) => new Date(`${key}T12:00:00Z`);
const weekdayFmt = new Intl.DateTimeFormat("es-CL", { weekday: "long", timeZone: "UTC" });
const dayMonthFmt = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: "UTC" });

export function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round((keyDate(toKey).getTime() - keyDate(fromKey).getTime()) / 86_400_000);
}

// Días hasta el próximo lunes (1..7: si hoy es lunes, el de la otra semana).
export function daysToNextMonday(todayKey: string): number {
  const dow = keyDate(todayKey).getUTCDay(); // 0=domingo
  return ((8 - dow) % 7) || 7;
}

// "Hoy", "Mañana", "jueves", "Venció ayer", "12 nov"… para la fecha de un seguimiento.
export function dueLabel(dueKey: string, todayKey: string): string {
  const d = daysBetweenKeys(todayKey, dueKey);
  if (d === 0) return "Hoy";
  if (d === 1) return "Mañana";
  if (d === -1) return "Venció ayer";
  if (d < -1) return `Venció hace ${-d} días`;
  if (d < 7) return weekdayFmt.format(keyDate(dueKey));
  return dayMonthFmt.format(keyDate(dueKey));
}
