// Perfil personal (etapa 2) — datos del dashboard de la tab "Resumen".
import { prisma } from "./db";
import { getStatuses } from "./statuses";
import { evaluateNudgeItems } from "./nudges";
import { dueInfo, mondayOf, toDateInput } from "./dates";
import { weekRange, addDays } from "./scheduleBlocks";

// Últimos N lunes (más antiguo primero), como "YYYY-MM-DD" en hora local
// (toISOString() da la fecha en UTC, que en Chile puede correr un día).
export function lastMondays(n: number, today = new Date()): string[] {
  const { start } = weekRange(mondayOf(today));
  const out: string[] = [];
  let cursor = start;
  for (let i = 0; i < n; i++) {
    out.unshift(toDateInput(cursor));
    cursor = addDays(cursor, -7);
  }
  return out;
}

export async function loadPersonalDashboard(userId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weeksBack = 8;
  const thisWeekStart = weekRange(mondayOf(now)).start;
  const rangeStart = addDays(thisWeekStart, -(weeksBack - 1) * 7);

  const [entries, tasks, statuses, nudges] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { userId, date: { gte: rangeStart } },
      select: { hours: true, date: true, request: { select: { type: true, client: { select: { name: true } } } } },
    }),
    prisma.request.findMany({
      where: {
        archivedAt: null,
        OR: [{ assigneeId: userId }, { collaborators: { some: { userId } } }],
      },
      select: { id: true, key: true, title: true, status: true, dueDate: true, finalizedAt: true, createdAt: true },
    }),
    getStatuses(),
    evaluateNudgeItems(userId),
  ]);

  const finalCodes = new Set(statuses.filter((s) => s.isFinal).map((s) => s.code));
  const statusMap = new Map(statuses.map((s) => [s.code, s]));

  const hoursThisWeek = entries.filter((e) => e.date >= thisWeekStart).reduce((a, e) => a + e.hours, 0);
  const hoursThisMonth = entries.filter((e) => e.date >= monthStart).reduce((a, e) => a + e.hours, 0);

  // Barras semanales (últimas 8 semanas, lunes a domingo).
  const mondayFmt = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short" });
  const weeks = lastMondays(weeksBack, now);
  const weekBars = weeks.map((m) => {
    const start = new Date(`${m}T00:00:00`);
    const end = addDays(start, 7);
    const value = entries.filter((e) => e.date >= start && e.date < end).reduce((a, e) => a + e.hours, 0);
    return { label: mondayFmt.format(start).replace(".", ""), value: Math.round(value * 10) / 10 };
  });

  // Horas por cliente y por tipo (todo lo cargado en las últimas 8 semanas).
  const byClient = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const e of entries) {
    byClient.set(e.request.client.name, (byClient.get(e.request.client.name) ?? 0) + e.hours);
    byType.set(e.request.type, (byType.get(e.request.type) ?? 0) + e.hours);
  }

  const openTasks = tasks.filter((t) => !finalCodes.has(t.status));
  const statusCounts = new Map<string, number>();
  for (const t of openTasks) statusCounts.set(t.status, (statusCounts.get(t.status) ?? 0) + 1);

  // Cumplimiento de entregas: tareas finalizadas con fecha de entrega, en
  // los últimos 90 días.
  const cutoff = addDays(now, -90);
  const delivered = tasks.filter((t) => finalCodes.has(t.status) && t.dueDate && t.finalizedAt && t.finalizedAt >= cutoff);
  const onTime = delivered.filter((t) => t.finalizedAt! <= t.dueDate!).length;

  const reminders = openTasks
    .map((t) => ({ t, due: dueInfo(t.dueDate, false) }))
    .filter((x) => x.due)
    .sort((a, b) => (a.t.dueDate?.getTime() ?? 0) - (b.t.dueDate?.getTime() ?? 0));

  return {
    hoursThisWeek,
    hoursThisMonth,
    weekBars,
    byClient: [...byClient.entries()].map(([label, value]) => ({ label, value: Math.round(value * 10) / 10 })),
    byType: [...byType.entries()].map(([label, value]) => ({ label, value: Math.round(value * 10) / 10 })),
    openTasksCount: openTasks.length,
    statusCounts: [...statusCounts.entries()].map(([code, value]) => ({
      label: statusMap.get(code)?.label ?? code,
      value,
      color: statusMap.get(code)?.color ?? "#9ca3af",
    })),
    delivery: { total: delivered.length, onTime, late: delivered.length - onTime },
    reminders: reminders.slice(0, 8).map(({ t, due }) => ({ key: t.key, title: t.title, ...due! })),
    nudges,
  };
}

export type PersonalDashboardData = Awaited<ReturnType<typeof loadPersonalDashboard>>;
