// Planificación automática de dailys (etapa 2). Se llama al guardar la
// configuración de un equipo y desde el Cron diario: siempre deja
// planificado hasta fin del mes siguiente. Nunca toca fechas cambiadas a
// mano (manualAt) ni las que ya tienen acuerdos.
import { prisma } from "./db";
import { chileDateKey, parseLocalDate } from "./dates";
import { monthBounds, nextFacilitators, planDays } from "./dailyRotation";
import { HOLIDAYS_CL, holidayYearsCovered } from "./holidaysCL";

export function planHorizon(todayKey: string): string {
  const [y, m] = todayKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); // mes siguiente
  return monthBounds(next).last;
}

// Completa las fechas que falten entre from y to. Devuelve cuántas creó y
// los años sin calendario de feriados (se planifican sin cancelar).
export async function fillSeries(seriesId: string, fromKey: string, toKey: string) {
  const series = await prisma.dailySeries.findUnique({
    where: { id: seriesId },
    include: { meetings: { select: { dayKey: true } } },
  });
  if (!series) return { created: 0, missingYears: [] as string[] };

  const active = new Set(
    (await prisma.user.findMany({ where: { id: { in: series.memberIds }, isActive: true }, select: { id: true } })).map(
      (u) => u.id,
    ),
  );
  const order = series.memberIds.filter((id) => active.has(id));
  if (order.length === 0) return { created: 0, missingYears: [] }; // sin nadie que la lidere
  const taken = new Set(series.meetings.map((m) => m.dayKey));
  const days = planDays(fromKey, toKey, series.weekdays, HOLIDAYS_CL).filter((d) => !taken.has(d.key));
  if (days.length === 0) return { created: 0, missingYears: [] };

  const last = await prisma.meeting.findFirst({
    where: { seriesId, cancelledAt: null, facilitatorId: { not: null }, dayKey: { lt: days[0].key } },
    orderBy: { dayKey: "desc" },
    select: { facilitatorId: true },
  });
  const working = days.filter((d) => !d.holiday);
  const people = nextFacilitators(order, last?.facilitatorId ?? null, working.length);
  const leaderOf = new Map(working.map((d, i) => [d.key, people[i] ?? null]));

  const { count } = await prisma.meeting.createMany({
    data: days.map((d) => ({
      seriesId,
      dayKey: d.key,
      date: parseLocalDate(d.key),
      createdById: order[0], // la daily automática no tiene autor real
      facilitatorId: d.holiday ? null : leaderOf.get(d.key),
      cancelledAt: d.holiday ? new Date() : null,
      cancelReason: d.holiday ? `Feriado: ${d.holiday}` : null,
    })),
    skipDuplicates: true, // otro proceso pudo planificar la misma fecha
  });
  const covered = holidayYearsCovered();
  const missingYears = [...new Set(days.map((d) => d.key.slice(0, 4)))].filter((y) => !covered.has(y));
  return { created: count, missingYears };
}

// Tras cambiar días, hora u orden: borra las fechas futuras automáticas
// sin acuerdos y vuelve a planificar. Desde hoy (fillSeries solo crea lo
// que falta: la daily de hoy, si existe, no se toca) para que la rotación
// parta en orden también el día que se crea la serie.
export async function replanSeries(seriesId: string) {
  const todayKey = chileDateKey(new Date());
  await prisma.meeting.deleteMany({
    where: { seriesId, dayKey: { gt: todayKey }, manualAt: null, followUps: { none: {} } },
  });
  return fillSeries(seriesId, todayKey, planHorizon(todayKey));
}

// Cron: extiende todas las series hasta el horizonte.
export async function fillAllSeries() {
  const todayKey = chileDateKey(new Date());
  const all = await prisma.dailySeries.findMany({ select: { id: true } });
  let created = 0;
  for (const s of all) created += (await fillSeries(s.id, todayKey, planHorizon(todayKey))).created;
  return created;
}
