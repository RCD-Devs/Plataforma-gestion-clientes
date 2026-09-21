// Cubicación de un proyecto: estimado inicial (horas y/o fechas) contra el
// consumo real. Pasarse NO bloquea el trabajo: lo que excede se marca en
// rojo ("horas en rojo" / días de atraso).
const DAY = 86400000;
// Día de calendario (no diferencias de ms): el cambio de hora hace días de 23/25 h.
const dayNum = (x: Date) => Math.round(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / DAY);

// Una etapa debe tener inicio <= término y, si el proyecto tiene marco de
// fechas, quedar completamente dentro de él.
export function stageDateIssue(
  stage: { startDate: Date | null; endDate: Date | null },
  project: { startDate: Date | null; endDate: Date | null },
): "orden" | "fuera_marco" | null {
  const { startDate: s, endDate: e } = stage;
  if (s && e && dayNum(e) < dayNum(s)) return "orden";
  if (project.startDate && s && dayNum(s) < dayNum(project.startDate)) return "fuera_marco";
  if (project.endDate && e && dayNum(e) > dayNum(project.endDate)) return "fuera_marco";
  if (project.startDate && project.endDate && (!s || !e)) return null; // fechas incompletas: lo decide quien llama
  return null;
}

export type BudgetStatus = {
  hasHours: boolean;
  remainingHours: number; // nunca negativo
  redHours: number; // exceso sobre lo estimado
  pctUsed: number; // sin tope: 130 = 30% sobre lo estimado
  hasDates: boolean;
  totalDays: number;
  elapsedDays: number; // acotado a [0, totalDays]
  lateDays: number; // días pasados de la fecha de término
};

export function budgetStatus(opts: {
  estimatedHours: number | null;
  consumedHours: number;
  startDate: Date | null;
  endDate: Date | null;
  now?: Date;
  done?: boolean; // proyecto sin tareas abiertas: no hay atraso
}): BudgetStatus {
  const { estimatedHours, consumedHours, startDate, endDate, done = false } = opts;
  const now = opts.now ?? new Date();
  const hasHours = estimatedHours != null && estimatedHours > 0;
  const est = hasHours ? estimatedHours! : 0;
  const hasDates = !!(startDate && endDate);
  const totalDays = hasDates ? Math.max(1, dayNum(endDate!) - dayNum(startDate!) + 1) : 0;
  const rawElapsed = hasDates ? dayNum(now) - dayNum(startDate!) + 1 : 0;
  return {
    hasHours,
    remainingHours: hasHours ? Math.max(0, est - consumedHours) : 0,
    redHours: hasHours ? Math.max(0, consumedHours - est) : 0,
    pctUsed: hasHours ? (consumedHours / est) * 100 : 0,
    hasDates,
    totalDays,
    elapsedDays: Math.min(Math.max(rawElapsed, 0), totalDays),
    lateDays:
      endDate && !done ? Math.max(0, dayNum(now) - dayNum(endDate)) : 0,
  };
}
