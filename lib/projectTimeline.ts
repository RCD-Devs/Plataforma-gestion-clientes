// Línea de tiempo de un proyecto (Gantt) y comparativo de demoras.
// Todo puro (sin base de datos) para poder probarlo; la carga de datos está
// en lib/projectInsights.ts.
const DAY = 86400000;

export type Interval = { start: Date; end: Date };
type Change = { status: string; at: Date };

// Tramos en que la tarea estuvo en un estado "espera al cliente". Un tramo
// abierto (la tarea sigue esperando) llega hasta `now`.
export function waitingIntervals(changes: Change[], waitCodes: Set<string>, now: Date): Interval[] {
  const sorted = [...changes].sort((a, b) => a.at.getTime() - b.at.getTime());
  const out: Interval[] = [];
  let open: Date | null = null;
  for (const c of sorted) {
    const waiting = waitCodes.has(c.status);
    if (waiting && !open) open = c.at;
    else if (!waiting && open) {
      out.push({ start: open, end: c.at });
      open = null;
    }
  }
  if (open) out.push({ start: open, end: now });
  return out;
}

// Días (con 1 decimal) cubiertos por la unión de tramos: si dos tareas
// esperan al cliente a la vez, ese período se cuenta una sola vez.
export function unionDays(intervals: Interval[]): number {
  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  let total = 0;
  let cur: { s: number; e: number } | null = null;
  for (const i of sorted) {
    const s = i.start.getTime();
    const e = i.end.getTime();
    if (!cur || s > cur.e) {
      if (cur) total += cur.e - cur.s;
      cur = { s, e };
    } else cur.e = Math.max(cur.e, e);
  }
  if (cur) total += cur.e - cur.s;
  return Math.round((total / DAY) * 10) / 10;
}

export type TimelineTask = {
  id: string;
  key: string;
  title: string;
  stageId: string | null;
  start: Date;
  end: Date;
  done: boolean;
  waiting: Interval[];
  totalDays: number;
  waitDays: number;
  teamDays: number;
};

export type TimelineStage = {
  id: string;
  name: string;
  isAdditional: boolean;
  estimatedHours: number | null;
  planned: Interval | null;
  actual: Interval | null; // desde la primera tarea hasta la última
};

export type ProjectTimeline = {
  range: Interval;
  planned: Interval | null;
  actual: Interval | null;
  stages: TimelineStage[];
  tasks: TimelineTask[];
  clientWaitDays: number;
  lateDays: number; // fin real (o hoy) vs. término planificado; 0 si no hay plan
};

const span = (a: Date, b: Date) => Math.round(((b.getTime() - a.getTime()) / DAY) * 10) / 10;

export function buildProjectTimeline(opts: {
  startDate: Date | null;
  endDate: Date | null;
  stages: {
    id: string;
    name: string;
    startDate: Date | null;
    endDate: Date | null;
    estimatedHours?: number | null;
    isAdditional?: boolean;
  }[];
  requests: {
    id: string;
    key: string;
    title: string;
    createdAt: Date;
    finalizedAt: Date | null;
    status: string;
    stageId: string | null;
    changes: Change[];
  }[];
  waitCodes: Set<string>;
  finalCodes: Set<string>;
  now?: Date;
}): ProjectTimeline {
  const now = opts.now ?? new Date();
  const tasks: TimelineTask[] = opts.requests.map((r) => {
    const done = opts.finalCodes.has(r.status);
    const end = done && r.finalizedAt ? r.finalizedAt : now;
    const waiting = waitingIntervals(r.changes, opts.waitCodes, now).map((w) => ({
      start: w.start < r.createdAt ? r.createdAt : w.start,
      end: w.end > end ? end : w.end,
    }));
    const totalDays = span(r.createdAt, end);
    const waitDays = unionDays(waiting);
    return {
      id: r.id,
      key: r.key,
      title: r.title,
      stageId: r.stageId,
      start: r.createdAt,
      end,
      done,
      waiting: waiting.filter((w) => w.end > w.start),
      totalDays,
      waitDays,
      teamDays: Math.max(0, Math.round((totalDays - waitDays) * 10) / 10),
    };
  });

  const extent = (ts: TimelineTask[]): Interval | null =>
    ts.length
      ? {
          start: new Date(Math.min(...ts.map((t) => t.start.getTime()))),
          end: new Date(Math.max(...ts.map((t) => t.end.getTime()))),
        }
      : null;

  const stages: TimelineStage[] = opts.stages.map((s) => ({
    id: s.id,
    name: s.name,
    isAdditional: s.isAdditional ?? false,
    estimatedHours: s.estimatedHours ?? null,
    planned: s.startDate && s.endDate ? { start: s.startDate, end: s.endDate } : null,
    actual: extent(tasks.filter((t) => t.stageId === s.id)),
  }));
  const planned = opts.startDate && opts.endDate ? { start: opts.startDate, end: opts.endDate } : null;
  const actual = extent(tasks);

  const dates = [
    now,
    ...(planned ? [planned.start, planned.end] : []),
    ...stages.flatMap((s) => (s.planned ? [s.planned.start, s.planned.end] : [])),
    ...tasks.flatMap((t) => [t.start, t.end]),
  ];
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  let max = new Date(Math.max(...dates.map((d) => d.getTime())));
  if (max.getTime() - min.getTime() < DAY) max = new Date(min.getTime() + DAY);

  const allDone = tasks.length > 0 && tasks.every((t) => t.done);
  const realEnd = actual ? (allDone ? actual.end : now) : null;
  return {
    range: { start: min, end: max },
    planned,
    actual,
    stages,
    tasks,
    clientWaitDays: unionDays(tasks.flatMap((t) => t.waiting)),
    lateDays: planned && realEnd ? Math.max(0, Math.round(span(planned.end, realEnd))) : 0,
  };
}
