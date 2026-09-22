// Perfil personal (etapa 1) — reglas puras del calendario de bloques de
// horario, separadas de la carga a base de datos para poder probarlas.
import { parseLocalDate } from "./dates";

export type BlockLike = { id: string; start: Date; end: Date };

// Bloques del mismo usuario que se cruzan con [start, end) — informativo,
// nunca bloquea el guardado.
export function overlapsOf<T extends BlockLike>(
  blocks: T[],
  start: Date,
  end: Date,
  excludeId?: string,
): T[] {
  return blocks.filter(
    (b) => b.id !== excludeId && b.start.getTime() < end.getTime() && b.end.getTime() > start.getTime(),
  );
}

// Lunes 00:00 → domingo 23:59:59.999, hora local, a partir de un
// "YYYY-MM-DD" (mondayOf) o de hoy si no viene ninguno.
export function weekRange(mondayStr?: string): { start: Date; end: Date } {
  const start = mondayStr ? parseLocalDate(mondayStr) : new Date();
  start.setHours(0, 0, 0, 0);
  // Si no vino un lunes explícito, retrocede al lunes de esa fecha.
  if (!mondayStr) {
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setMilliseconds(-1);
  return { start, end };
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}
