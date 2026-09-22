import Link from "next/link";
import type { PersonalDashboardData } from "@/lib/personalDashboard";
import { NUDGE_LABELS } from "@/lib/nudges";
import { BreakdownTabs, DonutChart, MonthBars } from "@/components/Charts";
import { toSlices } from "@/lib/chartSlices";
import { hoursLabel } from "@/lib/format";

const toneCls = {
  late: "border-[#f7c3c9] bg-[#fdeef0] text-[#a01830]",
  today: "border-[#fb693b] bg-[#feede6] text-[#9a4a1e]",
  soon: "border-[#fda565] bg-[#fdf1e3] text-[#9a5a25]",
};

// Dashboard personal (etapa 2 de Perfil) — métricas y alertas de un
// usuario, en la tab "Resumen". Server component: los donuts/barras son
// "use client" pero se pueden renderizar igual desde acá.
export function PersonalSummary({ data }: { data: PersonalDashboardData }) {
  const { delivery } = data;
  const onTimePct = delivery.total > 0 ? Math.round((delivery.onTime / delivery.total) * 100) : null;
  const activeNudges = data.nudges.filter((n) => NUDGE_LABELS[n.kind]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Horas esta semana" value={hoursLabel(data.hoursThisWeek)} />
        <Stat label="Horas este mes" value={hoursLabel(data.hoursThisMonth)} />
        <Stat label="Tareas abiertas" value={String(data.openTasksCount)} />
        <Stat
          label="Entregas a tiempo (90 días)"
          value={onTimePct != null ? `${onTimePct}%` : "—"}
          hint={delivery.total > 0 ? `${delivery.onTime} de ${delivery.total}` : "sin entregas registradas"}
          warn={onTimePct != null && onTimePct < 70}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="¿En qué se fueron tus horas? (últimas 8 semanas)">
          {data.byClient.length > 0 ? (
            <BreakdownTabs
              tabs={[
                { key: "client", label: "Por cliente", slices: toSlices(data.byClient) },
                { key: "type", label: "Por tipo", slices: toSlices(data.byType) },
              ]}
            />
          ) : (
            <Empty text="Aún no tienes horas cargadas en este período." />
          )}
        </Card>

        <Card title="Tus tareas abiertas por estado">
          {data.statusCounts.length > 0 ? (
            <DonutChart slices={data.statusCounts} unit="" />
          ) : (
            <Empty text="No tienes tareas abiertas. 👌" />
          )}
        </Card>
      </div>

      <Card title="Horas por semana">
        <MonthBars bars={data.weekBars} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Pendientes">
          {activeNudges.length === 0 ? (
            <Empty text="Sin pendientes por ahora. 👌" />
          ) : (
            <div className="space-y-3">
              {activeNudges.map((item) => {
                const label = NUDGE_LABELS[item.kind]!;
                return (
                  <div key={item.kind}>
                    <div className="mb-1 text-xs font-semibold text-[#7a4419]">
                      {label.icon} {label.title(item.taskCount)}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {item.tasks.map((t) => (
                        <Link
                          key={t.id}
                          href={`/solicitudes/${t.key}`}
                          className="rounded-md border border-[#fda565] bg-white px-2 py-0.5 text-xs text-[#5d3a16] hover:bg-[#fdf1e3]"
                        >
                          {t.key}
                        </Link>
                      ))}
                      {item.taskCount > item.tasks.length && (
                        <span className="px-1 py-0.5 text-xs text-[#9a5a25]">
                          +{item.taskCount - item.tasks.length} más
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Próximas entregas">
          {data.reminders.length === 0 ? (
            <Empty text="Sin entregas próximas. 👌" />
          ) : (
            <div className="space-y-1.5">
              {data.reminders.map((r) => (
                <Link
                  key={r.key}
                  href={`/solicitudes/${r.key}`}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${toneCls[r.tone]}`}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{r.key}</span> · {r.title}
                  </span>
                  <span className="shrink-0 text-xs font-semibold">{r.text}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e4e8ec] bg-white p-5">
      <h2 className="mb-3 font-brand text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#e4e8ec] bg-white p-4">
      <div className="text-xs text-[#5d6b77]">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: warn ? "#a01830" : undefined }}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-[#7f7f7f]">{hint}</div>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-[#7f7f7f]">{text}</p>;
}
