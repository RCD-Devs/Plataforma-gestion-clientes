import Link from "next/link";
import type { ProjectTimeline as Timeline, Interval, TimelineTask } from "@/lib/projectTimeline";
import { hoursLabel, shortDate } from "@/lib/format";

const DAY = 86400000;
const C = {
  planned: "#c9d1d9",
  actual: "#08a89f",
  done: "#0e9f6e",
  wait: "#fda565",
  late: "#d21f3c",
};

// Gantt de solo lectura: lo planificado (gris) contra lo real (verde/teal),
// con los períodos de espera del cliente en naranja. Compartido entre el
// portal del cliente y la ficha interna del proyecto.
export function ProjectGantt({
  timeline,
  taskHref,
}: {
  timeline: Timeline;
  taskHref: (key: string) => string;
}) {
  const { range } = timeline;
  const total = range.end.getTime() - range.start.getTime();
  const pct = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - range.start.getTime()) / total) * 100));
  const bar = (i: Interval) => ({ left: `${pct(i.start)}%`, width: `${Math.max(pct(i.end) - pct(i.start), 0.8)}%` });
  const today = pct(new Date());

  // Marcas del eje: semanales si el rango es corto, mensuales si es largo.
  const ticks: Date[] = [];
  if (total / DAY <= 70) {
    for (let t = range.start.getTime(); t <= range.end.getTime(); t += 7 * DAY) ticks.push(new Date(t));
  } else {
    const d = new Date(range.start.getFullYear(), range.start.getMonth() + 1, 1);
    while (d <= range.end) {
      ticks.push(new Date(d));
      d.setMonth(d.getMonth() + 1);
    }
  }
  const tickFmt = new Intl.DateTimeFormat("es-CL", total / DAY <= 70 ? { day: "2-digit", month: "short" } : { month: "short", year: "2-digit" });

  const stageTasks = (id: string | null) => timeline.tasks.filter((t) => t.stageId === id);
  const groups = [
    ...timeline.stages.map((s) => ({ key: s.id, label: s.name, stage: s, tasks: stageTasks(s.id) })),
    ...(timeline.stages.length > 0 && stageTasks(null).length > 0
      ? [{ key: "none", label: "Sin etapa", stage: null, tasks: stageTasks(null) }]
      : []),
    ...(timeline.stages.length === 0 ? [{ key: "all", label: "", stage: null, tasks: timeline.tasks }] : []),
  ];

  const Row = ({ label, href, sub, children, strong }: { label: string; href?: string; sub?: string; children: React.ReactNode; strong?: boolean }) => (
    <div className="flex items-center border-b border-[#f1f3f4] last:border-0">
      <div className={`w-44 shrink-0 truncate px-2 py-1.5 text-xs ${strong ? "font-semibold" : "pl-5 text-[#5d6b77]"}`} title={label}>
        {href ? (
          <Link href={href} className="hover:text-[#08a89f] hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
        {sub && <div className="text-[10px] font-normal text-[#7f7f7f]">{sub}</div>}
      </div>
      <div className="relative h-9 flex-1">
        {ticks.map((t, i) => (
          <div key={i} className="absolute inset-y-0 border-l border-[#f1f3f4]" style={{ left: `${pct(t)}%` }} />
        ))}
        <div className="absolute inset-y-0 border-l-2 border-[#fb693b]" style={{ left: `${today}%` }} title="Hoy" />
        {children}
      </div>
    </div>
  );

  const TaskBar = ({ t }: { t: TimelineTask }) => (
    <>
      <div
        className="absolute top-2.5 h-4 rounded"
        style={{ ...bar({ start: t.start, end: t.end }), background: t.done ? C.done : C.actual, opacity: 0.85 }}
        title={`${t.key} · ${t.title}\n${shortDate(t.start)} → ${t.done ? shortDate(t.end) : "en curso"} (${t.totalDays} d)${t.waitDays > 0 ? `\nEsperando al cliente: ${t.waitDays} d` : ""}`}
      />
      {t.waiting.map((w, i) => (
        <div
          key={i}
          className="absolute top-2.5 h-4 rounded"
          style={{ ...bar(w), background: C.wait }}
          title={`Esperando respuesta del cliente · ${shortDate(w.start)} → ${shortDate(w.end)}`}
        />
      ))}
    </>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#5d6b77]">
        <Legend color={C.planned} label="Planificado" />
        <Legend color={C.actual} label="Real (en curso)" />
        <Legend color={C.done} label="Finalizada" />
        <Legend color={C.wait} label="Esperando al cliente" />
        <Legend color={C.late} label="Fuera de plazo" />
        <Legend color="#fb693b" label="Hoy" line />
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="flex border-b border-[#e4e8ec] text-[10px] text-[#7f7f7f]">
            <div className="w-44 shrink-0" />
            <div className="relative h-5 flex-1">
              {ticks.map((t, i) => (
                <span key={i} className="absolute -translate-x-1/2 capitalize" style={{ left: `${pct(t)}%` }}>
                  {tickFmt.format(t).replace(".", "")}
                </span>
              ))}
            </div>
          </div>

          {timeline.planned && (
            <Row label="Proyecto" strong sub={timeline.actual ? undefined : "sin tareas aún"}>
              <div className="absolute top-1.5 h-2 rounded" style={{ ...bar(timeline.planned), background: C.planned }} title={`Planificado: ${shortDate(timeline.planned.start)} → ${shortDate(timeline.planned.end)}`} />
              {timeline.actual && <ActualBar actual={timeline.actual} plannedEnd={timeline.planned.end} bar={bar} pct={pct} />}
            </Row>
          )}

          {groups.map((g) => (
            <div key={g.key}>
              {g.stage && (
                <Row label={g.label} strong>
                  {g.stage.planned && (
                    <div className="absolute top-1.5 h-2 rounded" style={{ ...bar(g.stage.planned), background: C.planned }} title={`Planificado: ${shortDate(g.stage.planned.start)} → ${shortDate(g.stage.planned.end)}`} />
                  )}
                  {g.stage.actual && <ActualBar actual={g.stage.actual} plannedEnd={g.stage.planned?.end ?? null} bar={bar} pct={pct} />}
                </Row>
              )}
              {!g.stage && g.label && (
                <div className="border-b border-[#f1f3f4] bg-[#f8fafb] px-2 py-1 text-[11px] font-semibold text-[#5d6b77]">{g.label}</div>
              )}
              {g.tasks.map((t) => (
                <Row key={t.id} label={`${t.key} · ${t.title}`} href={taskHref(t.key)}>
                  <TaskBar t={t} />
                </Row>
              ))}
            </div>
          ))}
          {timeline.tasks.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-[#7f7f7f]">Aún no hay tareas en este proyecto.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Barra real de una etapa/proyecto: lo que excede el término planificado en rojo.
function ActualBar({
  actual,
  plannedEnd,
  bar,
  pct,
}: {
  actual: Interval;
  plannedEnd: Date | null;
  bar: (i: Interval) => { left: string; width: string };
  pct: (d: Date) => number;
}) {
  const over = plannedEnd && actual.end > plannedEnd;
  const okEnd = over ? plannedEnd! : actual.end;
  return (
    <>
      <div className="absolute top-4 h-3 rounded-l" style={{ ...bar({ start: actual.start, end: okEnd }), background: C.actual }} />
      {over && actual.start < plannedEnd! && (
        <div className="absolute top-4 h-3 rounded-r" style={{ left: `${pct(plannedEnd!)}%`, width: `${Math.max(pct(actual.end) - pct(plannedEnd!), 0.8)}%`, background: C.late }} title="Fuera del plazo planificado" />
      )}
      {over && actual.start >= plannedEnd! && (
        <div className="absolute top-4 h-3 rounded" style={{ ...bar(actual), background: C.late }} title="Fuera del plazo planificado" />
      )}
    </>
  );
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={line ? "h-3 w-0.5" : "h-2.5 w-4 rounded"} style={{ background: color }} />
      {label}
    </span>
  );
}

// Comparativo: qué tareas se demoraron más y cuánto de esa demora fue
// espera de respuesta del cliente vs. trabajo del equipo.
export function DelayComparison({
  timeline,
  hoursByRequest,
  taskHref,
}: {
  timeline: Timeline;
  hoursByRequest: Map<string, number>;
  taskHref: (key: string) => string;
}) {
  const tasks = [...timeline.tasks].sort((a, b) => b.totalDays - a.totalDays).slice(0, 8);
  const maxDays = Math.max(...tasks.map((t) => t.totalDays), 1);
  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Espera de respuesta del cliente"
          value={`${timeline.clientWaitDays} d`}
          hint="días con al menos una tarea esperando al cliente"
          warn={timeline.clientWaitDays > 0}
        />
        <Stat
          label="Atraso vs. término planificado"
          value={timeline.planned ? `${timeline.lateDays} d` : "—"}
          hint={timeline.planned ? "según la planificación del proyecto" : "el proyecto no tiene fechas"}
          warn={timeline.lateDays > 0}
        />
        <Stat
          label="Días de trabajo del equipo"
          value={`${Math.round(timeline.tasks.reduce((a, t) => a + t.teamDays, 0) * 10) / 10} d`}
          hint="suma de la duración de tareas sin la espera del cliente"
        />
      </div>
      {timeline.clientWaitDays > 0 && timeline.lateDays > 0 && (
        <p className="mb-4 rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
          Hasta <b>{Math.min(timeline.clientWaitDays, timeline.lateDays)} días</b> del atraso del proyecto
          coinciden con tareas que estuvieron esperando respuesta del cliente.
        </p>
      )}
      {tasks.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[#e4e8ec]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[#e4e8ec] text-left text-xs text-[#5d6b77]">
                <th className="px-4 py-2.5 font-semibold">Tareas que más se demoraron</th>
                <th className="w-64 px-4 py-2.5 font-semibold">Duración</th>
                <th className="px-4 py-2.5 font-semibold">Espera cliente</th>
                <th className="px-4 py-2.5 font-semibold">Equipo</th>
                <th className="px-4 py-2.5 font-semibold">Horas</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-b border-[#f1f3f4] last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={taskHref(t.key)} className="hover:text-[#08a89f] hover:underline">
                      <span className="text-xs text-[#7f7f7f]">{t.key}</span>{" "}
                      <span className="font-medium">{t.title}</span>
                    </Link>
                    {!t.done && <span className="ml-2 text-[10px] text-[#7f7f7f]">en curso</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex h-3 overflow-hidden rounded bg-[#f3f4f6]" style={{ width: `${(t.totalDays / maxDays) * 100}%` }} title={`${t.totalDays} d en total`}>
                      <div style={{ width: `${t.totalDays ? (t.teamDays / t.totalDays) * 100 : 0}%`, background: C.actual }} />
                      <div style={{ width: `${t.totalDays ? (t.waitDays / t.totalDays) * 100 : 0}%`, background: C.wait }} />
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#5d6b77]">{t.totalDays} d</div>
                  </td>
                  <td className="px-4 py-2.5" style={{ color: t.waitDays > 0 ? "#9a4a1e" : undefined }}>
                    {t.waitDays > 0 ? `${t.waitDays} d` : "—"}
                  </td>
                  <td className="px-4 py-2.5">{t.teamDays} d</td>
                  <td className="px-4 py-2.5">{hoursByRequest.get(t.id) ? hoursLabel(hoursByRequest.get(t.id)!) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-[#7f7f7f]">
        La espera del cliente se mide desde que una tarea pasa al estado «En espera del cliente» hasta que vuelve a
        avanzar. Solo se registra desde que existe ese estado.
      </p>
    </div>
  );
}

function Stat({ label, value, hint, warn }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-[#f4f6f8] p-3">
      <div className="text-xs text-[#5d6b77]">{label}</div>
      <div className="mt-0.5 text-lg font-semibold" style={{ color: warn ? "#9a4a1e" : undefined }}>
        {value}
      </div>
      <div className="text-[11px] text-[#7f7f7f]">{hint}</div>
    </div>
  );
}
