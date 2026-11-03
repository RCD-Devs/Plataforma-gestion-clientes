// Avisos a quien lidera la daily (etapa 2), desde el Cron diario:
// - víspera: campana ("mañana lideras…");
// - el mismo día: campana + correo ("hoy lideras…").
// Cada aviso sale una vez: se "reclama" con updateMany condicionado, y se
// limpia si un admin cambia a la persona (setDailyFacilitator).
import { prisma } from "./db";
import { notifyDailyFacilitator } from "./email";
import { chileDateKey } from "./dates";
import { addDaysKey } from "./followUps";

export async function notifyDailyFacilitators() {
  const todayKey = chileDateKey(new Date());
  const tomorrowKey = addDaysKey(todayKey, 1);
  const meetings = await prisma.meeting.findMany({
    where: {
      seriesId: { not: null },
      cancelledAt: null,
      dayKey: { in: [todayKey, tomorrowKey] },
      facilitator: { isActive: true },
      OR: [{ dayKey: todayKey, dayOfNotifiedAt: null }, { dayKey: tomorrowKey, dayBeforeNotifiedAt: null }],
    },
    select: {
      id: true,
      dayKey: true,
      time: true,
      facilitator: { select: { email: true } },
      series: { select: { time: true, team: { select: { name: true } } } },
    },
  });

  let sent = 0;
  for (const m of meetings) {
    const isToday = m.dayKey === todayKey;
    const field = isToday ? "dayOfNotifiedAt" : "dayBeforeNotifiedAt";
    const claimed = await prisma.meeting.updateMany({ where: { id: m.id, [field]: null }, data: { [field]: new Date() } });
    if (claimed.count === 0 || !m.facilitator || !m.series) continue;
    await notifyDailyFacilitator({
      to: m.facilitator.email,
      teamName: m.series.team.name,
      time: m.time ?? m.series.time,
      when: isToday ? "hoy" : "mañana",
    });
    sent++;
  }
  return sent;
}
