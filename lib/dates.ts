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

// Lunes de la semana de d, como "YYYY-MM-DD" — clave de throttle semanal
// (ver HoursAlertLog).
export function mondayOf(d: Date) {
  const day = d.getDay(); // 0=domingo
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return toDateInput(monday);
}
