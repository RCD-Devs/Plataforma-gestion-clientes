import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isManager } from "@/lib/authz";
import { REQUEST_TYPES } from "@/lib/constants";
import { getStatuses, getStatusMap, softBg } from "@/lib/statuses";
import { StatCard } from "@/components/ui";
import { hoursLabel, shortDate, longDate } from "@/lib/format";
import { getHoursSummaries } from "@/lib/hoursLedger";
import { toDateInput, endOfToday } from "@/lib/dates";
import {
  slaDays,
  classifySla,
  mean,
  median,
  round1,
  monthRange,
  monthKey,
  monthLabel,
  SLA_RANGES,
} from "@/lib/sla";
import {
  MonthlyEvolutionChart,
  GroupedBarChart,
  ReportDoughnut,
} from "@/components/ReportCharts";

export const dynamic = "force-dynamic";

const inputCls =
  "h-8 rounded-md border border-[#e4e8ec] bg-white px-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function ClientReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isManager(user.role)) redirect("/mi-espacio");

  const { id } = await params;
  const sp = await searchParams;

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();
  if (user.role === "COORDINADOR_CUENTA" && client.accountManagerId !== user.id) {
    notFound();
  }

  const now = new Date();
  const desde = sp.desde
    ? new Date(`${sp.desde}T00:00:00`)
    : new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const hasta = sp.hasta ? new Date(`${sp.hasta}T23:59:59`) : endOfToday();

  const [requests, timeEntries, statuses, statusMap] = await Promise.all([
    prisma.request.findMany({
      where: { clientId: id, createdAt: { gte: desde, lte: hasta } },
      include: {
        assignee: true,
        timeEntries: { select: { hours: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.timeEntry.findMany({
      where: {
        date: { gte: desde, lte: hasta },
        request: { clientId: id },
      },
      include: { user: true, request: { select: { type: true } } },
    }),
    getStatuses(),
    getStatusMap(),
  ]);
  const finalCodes = new Set(statuses.filter((s) => s.isFinal).map((s) => s.code));

  // --- KPIs ---
  const finalizadas = requests.filter(
    (r) => finalCodes.has(r.status) && r.finalizedAt,
  );
  const slaList = finalizadas.map((r) => slaDays(r.createdAt, r.finalizedAt!));
  const slaPromedio = round1(mean(slaList));
  const slaMediana = round1(median(slaList));
  const rangeCounts = { OPTIMO: 0, ACEPTABLE: 0, ATENCION: 0, CRITICO: 0 };
  for (const d of slaList) rangeCounts[classifySla(d)]++;
  const tasaOptima =
    slaList.length > 0 ? round1((rangeCounts.OPTIMO / slaList.length) * 100) : 0;
  const horasTotales = timeEntries.reduce((a, t) => a + t.hours, 0);
  const ledger = (await getHoursSummaries([client])).get(client.id)!;

  // --- Evolución mensual (agrupado por mes de INGRESO) ---
  const months = monthRange(desde, hasta);
  const byMonth = new Map<string, typeof requests>();
  for (const m of months) byMonth.set(m, []);
  for (const r of requests) {
    const k = monthKey(r.createdAt);
    if (byMonth.has(k)) byMonth.get(k)!.push(r);
  }
  const evolLabels = months.map(monthLabel);
  const evolVolumen = months.map((m) => byMonth.get(m)!.length);
  const evolPromedio = months.map((m) => {
    const f = byMonth
      .get(m)!
      .filter((r) => finalCodes.has(r.status) && r.finalizedAt)
      .map((r) => slaDays(r.createdAt, r.finalizedAt!));
    return round1(mean(f));
  });
  const evolMediana = months.map((m) => {
    const f = byMonth
      .get(m)!
      .filter((r) => finalCodes.has(r.status) && r.finalizedAt)
      .map((r) => slaDays(r.createdAt, r.finalizedAt!));
    return round1(median(f));
  });

  // --- Horas por mes ---
  const hoursByMonth = new Map<string, number>();
  for (const m of months) hoursByMonth.set(m, 0);
  for (const t of timeEntries) {
    const k = monthKey(t.date);
    if (hoursByMonth.has(k)) hoursByMonth.set(k, hoursByMonth.get(k)! + t.hours);
  }
  const hoursMonthValues = months.map((m) => round1(hoursByMonth.get(m) ?? 0));

  // --- SLA por tipo ---
  const typesInUse = REQUEST_TYPES.filter((t) =>
    finalizadas.some((r) => r.type === t),
  );
  const slaPromPorTipo = typesInUse.map((t) =>
    round1(
      mean(
        finalizadas
          .filter((r) => r.type === t)
          .map((r) => slaDays(r.createdAt, r.finalizedAt!)),
      ),
    ),
  );
  const slaMedPorTipo = typesInUse.map((t) =>
    round1(
      median(
        finalizadas
          .filter((r) => r.type === t)
          .map((r) => slaDays(r.createdAt, r.finalizedAt!)),
      ),
    ),
  );

  // --- Horas por tipo ---
  const hoursByType = new Map<string, number>();
  for (const t of timeEntries) {
    hoursByType.set(t.request.type, (hoursByType.get(t.request.type) ?? 0) + t.hours);
  }
  const typesWithHours = [...hoursByType.keys()].sort(
    (a, b) => hoursByType.get(b)! - hoursByType.get(a)!,
  );
  const hoursByTypeValues = typesWithHours.map((t) => round1(hoursByType.get(t)!));

  // --- Horas por perfil ---
  const hoursByUser = new Map<
    string,
    { name: string; color: string | null; hours: number }
  >();
  for (const t of timeEntries) {
    const cur = hoursByUser.get(t.userId) ?? {
      name: t.user.name,
      color: t.user.color,
      hours: 0,
    };
    cur.hours += t.hours;
    hoursByUser.set(t.userId, cur);
  }
  const perUser = [...hoursByUser.values()].sort((a, b) => b.hours - a.hours);

  // --- Distribución de estado ---
  const statusCounts = statuses.map(
    (s) => requests.filter((r) => r.status === s.code).length,
  );

  const fmt = toDateInput;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e4e8ec] bg-white px-6 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/clientes"
              className="text-xs text-[#08a89f] hover:underline"
            >
              ← Clientes
            </Link>
            <h1 className="font-brand text-base font-semibold">
              Reporte SLA · {client.name}
            </h1>
            <p className="text-xs text-[#5d6b77]">
              {shortDate(desde)} — {shortDate(hasta)} · SLA = fecha de
              finalización − fecha de ingreso
            </p>
          </div>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-[#5d6b77]">
              Desde
              <input
                name="desde"
                type="date"
                defaultValue={fmt(desde)}
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-[#5d6b77]">
              Hasta
              <input
                name="hasta"
                type="date"
                defaultValue={fmt(hasta)}
                className={inputCls}
              />
            </label>
            <button className="h-8 rounded-md bg-[#0bdbcf] px-3 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
              Aplicar
            </button>
          </form>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Total solicitudes"
            value={requests.length}
            hint={`${finalizadas.length} finalizadas`}
          />
          <StatCard
            label="SLA promedio"
            value={`${slaPromedio} d`}
            hint={`${slaList.length} con SLA`}
          />
          <StatCard
            label="SLA mediana"
            value={`${slaMediana} d`}
            hint="50% en ese plazo o menos"
          />
          <StatCard
            label="Tasa óptima (0-4d)"
            value={`${tasaOptima}%`}
            hint={`${rangeCounts.OPTIMO} de ${slaList.length}`}
          />
          <StatCard
            label="Completadas"
            value={
              requests.length > 0
                ? `${round1((finalizadas.length / requests.length) * 100)}%`
                : "—"
            }
            hint={`${finalizadas.length} de ${requests.length}`}
          />
          <StatCard
            label="Horas invertidas"
            value={hoursLabel(horasTotales)}
            hint={
              client.contractedHours > 0
                ? `de ${hoursLabel(client.contractedHours)} por ciclo`
                : "en el período"
            }
          />
          <StatCard
            label="Saldo disponible hoy"
            value={hoursLabel(ledger.available)}
            hint={ledger.extraHours > 0 ? `+${hoursLabel(ledger.extraHours)} extra` : "con arrastre de 3 meses"}
          />
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-[#5d6b77]">
            Evolución SLA — comparativo mensual
          </h2>
          <div className="rounded-xl border border-[#e4e8ec] bg-white p-4">
            <p className="mb-2 text-[11px] leading-snug text-[#7f7f7f]">
              Promedio y mediana = solo solicitudes finalizadas · barras =
              total ingresado ese mes, independiente del estado
            </p>
            <MonthlyEvolutionChart
              labels={evolLabels}
              volumen={evolVolumen}
              promedio={evolPromedio}
              mediana={evolMediana}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-[#5d6b77]">
            Horas invertidas por mes
          </h2>
          <div className="rounded-xl border border-[#e4e8ec] bg-white p-4">
            <p className="mb-2 text-[11px] leading-snug text-[#7f7f7f]">
              Horas cargadas por el equipo, agrupadas por el mes en que se
              trabajaron — base para justificar la HH mensual
            </p>
            <GroupedBarChart
              labels={evolLabels}
              a={hoursMonthValues}
              aLabel="Horas"
              aColor="#16324a"
              suffix="h"
              height={240}
            />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-[#e4e8ec] bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold">SLA por tipo de solicitud</h2>
            <p className="mb-2 text-[11px] leading-snug text-[#7f7f7f]">
              Promedio y mediana de días SLA por tipo, solo finalizadas
            </p>
            {typesInUse.length > 0 ? (
              <GroupedBarChart
                labels={typesInUse}
                a={slaPromPorTipo}
                b={slaMedPorTipo}
                aLabel="Promedio"
                bLabel="Mediana"
                aColor="#08a89f"
                bColor="rgba(8,168,159,0.25)"
              />
            ) : (
              <div className="py-10 text-center text-sm text-[#7f7f7f]">
                Sin solicitudes finalizadas en el período.
              </div>
            )}
          </section>

          <section className="rounded-xl border border-[#e4e8ec] bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold">Distribución SLA por rango</h2>
            <p className="mb-2 text-[11px] leading-snug text-[#7f7f7f]">
              Óptimo 0-4d · Aceptable 5-9d · Atención 10-14d · Crítico 15+d
            </p>
            {slaList.length > 0 ? (
              <ReportDoughnut
                labels={SLA_RANGES.map((r) => r.label)}
                values={SLA_RANGES.map((r) => rangeCounts[r.key])}
                colors={SLA_RANGES.map((r) => r.color)}
              />
            ) : (
              <div className="py-10 text-center text-sm text-[#7f7f7f]">
                Sin datos de SLA en el período.
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-[#e4e8ec] bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold">Horas por tipo de solicitud</h2>
            <p className="mb-2 text-[11px] leading-snug text-[#7f7f7f]">
              Distribución de horas cargadas según el tipo de trabajo
            </p>
            {typesWithHours.length > 0 ? (
              <GroupedBarChart
                labels={typesWithHours}
                a={hoursByTypeValues}
                aLabel="Horas"
                aColor="#fb693b"
                suffix="h"
              />
            ) : (
              <div className="py-10 text-center text-sm text-[#7f7f7f]">
                Sin horas cargadas en el período.
              </div>
            )}
          </section>

          <section className="rounded-xl border border-[#e4e8ec] bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold">Distribución por estado</h2>
            <p className="mb-2 text-[11px] leading-snug text-[#7f7f7f]">
              Estado actual de las solicitudes ingresadas en el período
            </p>
            {requests.length > 0 ? (
              <ReportDoughnut
                labels={statuses.map((s) => s.label)}
                values={statusCounts}
                colors={statuses.map((s) => s.color)}
              />
            ) : (
              <div className="py-10 text-center text-sm text-[#7f7f7f]">
                Sin solicitudes en el período.
              </div>
            )}
          </section>
        </div>

        <section className="rounded-xl border border-[#e4e8ec] bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold">Horas por perfil</h2>
          <p className="mb-2 text-[11px] leading-snug text-[#7f7f7f]">
            Quién trabajó cuánto para este cliente en el período — respaldo
            directo de la HH mensual
          </p>
          {perUser.length > 0 ? (
            <GroupedBarChart
              labels={perUser.map((u) => u.name)}
              a={perUser.map((u) => round1(u.hours))}
              aLabel="Horas"
              aColor="#08a89f"
              suffix="h"
              horizontal
              height={Math.max(160, perUser.length * 40)}
            />
          ) : (
            <div className="py-10 text-center text-sm text-[#7f7f7f]">
              Sin horas cargadas en el período.
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-[#5d6b77]">
            Detalle de solicitudes ({requests.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-[#e4e8ec] bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-[#e4e8ec] text-left text-xs text-[#5d6b77]">
                  <th className="px-4 py-2.5 font-semibold">Solicitud</th>
                  <th className="px-4 py-2.5 font-semibold">Tipo</th>
                  <th className="px-4 py-2.5 font-semibold">Ingreso</th>
                  <th className="px-4 py-2.5 font-semibold">Finalización</th>
                  <th className="px-4 py-2.5 font-semibold">SLA</th>
                  <th className="px-4 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 font-semibold">Responsable</th>
                  <th className="px-4 py-2.5 font-semibold">Horas</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const hrs = r.timeEntries.reduce((a, t) => a + t.hours, 0);
                  const sla =
                    finalCodes.has(r.status) && r.finalizedAt
                      ? round1(slaDays(r.createdAt, r.finalizedAt))
                      : null;
                  const range = sla != null ? classifySla(sla) : null;
                  const rangeMeta = range
                    ? SLA_RANGES.find((x) => x.key === range)
                    : null;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[#f1f3f4] last:border-0 hover:bg-[#f8fafb]"
                    >
                      <td className="px-4 py-3">
                        <Link href={`/solicitudes/${r.key}`}>
                          <div className="text-xs text-[#7f7f7f]">{r.key}</div>
                          <div className="max-w-xs truncate font-medium">
                            {r.title}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[#5d6b77]">{r.type}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {shortDate(r.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {r.finalizedAt ? shortDate(r.finalizedAt) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {sla != null ? (
                          <span
                            style={{ color: rangeMeta?.color }}
                            className="font-semibold"
                          >
                            {sla} d
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          style={{
                            color: statusMap[r.status]?.color,
                            background: statusMap[r.status]
                              ? softBg(statusMap[r.status].color)
                              : undefined,
                          }}
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
                        >
                          {statusMap[r.status]?.label ?? r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r.assignee?.name ?? (
                          <span className="text-[#9aa5ad]">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {hrs > 0 ? hoursLabel(hrs) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {requests.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-[#7f7f7f]"
                    >
                      No hay solicitudes en este período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[#7f7f7f]">
            Generado {longDate(new Date())} · Rompecabeza / Grupo Revo — datos
            en vivo desde la plataforma de gestión.
          </p>
        </section>
      </div>
    </div>
  );
}
