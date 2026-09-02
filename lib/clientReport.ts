// Cálculo del reporte SLA por cliente — extraído de
// app/(app)/clientes/[id]/reporte/page.tsx para reusarlo también en el
// export a Excel (Rec. #81), sin duplicar la lógica.
import { prisma } from "./db";
import type { StatusInfo } from "./statuses";
import { getStatuses, getStatusMap } from "./statuses";
import { REQUEST_TYPES } from "./constants";
import { getHoursSummaries } from "./hoursLedger";
import { endOfToday } from "./dates";
import {
  slaDays,
  classifySla,
  mean,
  median,
  round1,
  monthRange,
  monthKey,
  monthLabel,
} from "./sla";

export async function getClientReportData(
  clientId: string,
  desdeParam?: string,
  hastaParam?: string,
) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return null;

  const now = new Date();
  const desde = desdeParam
    ? new Date(`${desdeParam}T00:00:00`)
    : new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const hasta = hastaParam ? new Date(`${hastaParam}T23:59:59`) : endOfToday();

  const [requests, timeEntries, statuses, statusMap] = await Promise.all([
    prisma.request.findMany({
      where: { clientId, createdAt: { gte: desde, lte: hasta } },
      include: {
        assignee: true,
        timeEntries: { select: { hours: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.timeEntry.findMany({
      where: {
        date: { gte: desde, lte: hasta },
        request: { clientId },
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

  return {
    client,
    desde,
    hasta,
    requests,
    statuses: statuses as StatusInfo[],
    statusMap,
    finalCodes,
    finalizadas,
    slaList,
    slaPromedio,
    slaMediana,
    rangeCounts,
    tasaOptima,
    horasTotales,
    ledger,
    evolLabels,
    evolVolumen,
    evolPromedio,
    evolMediana,
    hoursMonthValues,
    typesInUse,
    slaPromPorTipo,
    slaMedPorTipo,
    typesWithHours,
    hoursByTypeValues,
    perUser,
    statusCounts,
  };
}

export type ClientReportData = NonNullable<
  Awaited<ReturnType<typeof getClientReportData>>
>;
