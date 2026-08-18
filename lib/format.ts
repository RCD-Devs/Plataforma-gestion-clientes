export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

const fmtShort = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
});
const fmtLong = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

export function shortDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return fmtShort.format(new Date(d));
}

export function longDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return fmtLong.format(new Date(d));
}

export function relative(d: Date | string) {
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  const day = 86400000;
  if (diff < 60000) return "recién";
  if (diff < 3600000) return `hace ${Math.floor(diff / 60000)} min`;
  if (diff < day) return `hace ${Math.floor(diff / 3600000)} h`;
  if (diff < 2 * day) return "ayer";
  if (diff < 7 * day) return `hace ${Math.floor(diff / day)} días`;
  return fmtShort.format(date);
}

export function hoursLabel(h: number) {
  return `${Math.round(h * 10) / 10} h`;
}
