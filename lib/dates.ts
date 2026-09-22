export const DAY = 86400000;

function startOfDayMs(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Días calendario entre hoy y la fecha (negativo = vencida).
// Se normaliza a medianoche local: una entrega guardada a las 12:00
// "vence hoy" durante todo el día, no solo desde el mediodía.
export function daysFromToday(d: Date) {
  return Math.round((startOfDayMs(d) - startOfDayMs(new Date())) / DAY);
}

export type DueTone = "late" | "today" | "soon";

// Urgencia de una fecha de entrega — null si no aplica (sin fecha, o
// tarea final, o falta más de 3 días). Compartida entre Mi espacio, el
// panel de entregas del header y el dashboard personal.
export function dueInfo(dueDate: Date | null, isFinal: boolean): { tone: DueTone; text: string } | null {
  if (!dueDate || isFinal) return null;
  const days = daysFromToday(dueDate);
  if (days < 0) return { tone: "late", text: `Vencida hace ${-days} día${days === -1 ? "" : "s"}` };
  if (days === 0) return { tone: "today", text: "Vence hoy" };
  if (days <= 3) return { tone: "soon", text: `Vence en ${days} día${days === 1 ? "" : "s"}` };
  return null;
}

export function endOfToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999);
}

// "YYYY-MM-DD" en hora LOCAL para inputs type=date (toISOString desfasa +1
// día en Chile por la tarde).
export function toDateInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Un input type=date entrega "YYYY-MM-DD"; new Date() lo interpretaría como
// medianoche UTC (día anterior en Chile). Se fija mediodía local.
export function parseLocalDate(s: string) {
  return new Date(`${s}T12:00:00`);
}

// Desfase (en minutos) de `timeZone` respecto a UTC para el instante dado
// — positivo si va adelantado. Varía con el horario de verano, por eso se
// recalcula para cada fecha en vez de asumir un valor fijo.
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instant).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24, // Intl da "24" a medianoche con hour12:false
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - instant.getTime()) / 60000;
}

// "YYYY-MM-DDTHH:mm" de un <input type="datetime-local">, interpretado
// como hora de pared en `timeZone` (Chile por defecto) — sin esto,
// new Date(s) lo interpreta con la zona horaria del PROCESO donde corre
// el código: en local es la del desarrollador (Chile), pero en Vercel es
// UTC, así que el mismo bloque quedaba corrido ~3-4 horas solo en
// producción. Devuelve null si el formato no calza.
export function zonedTimeToUtc(wallClock: string, timeZone = "America/Santiago"): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wallClock);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const naiveMs = Date.UTC(y, mo - 1, d, h, mi, 0);
  // 2 pasadas alcanza para converger, incluso cerca de un cambio de hora.
  let guessMs = naiveMs;
  for (let i = 0; i < 2; i++) {
    guessMs = naiveMs - offsetMinutes(new Date(guessMs), timeZone) * 60000;
  }
  return new Date(guessMs);
}

// Lunes de la semana de d, como "YYYY-MM-DD" — clave de throttle semanal
// (ver HoursAlertLog).
export function mondayOf(d: Date) {
  const day = d.getDay(); // 0=domingo
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return toDateInput(monday);
}
