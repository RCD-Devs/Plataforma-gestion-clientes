// Aviso de seguimientos (dailys, etapa 1): al responsable y a los
// participantes (a quien lo anotó si el responsable quedó inactivo). Se
// revisan los de TODOS al cargar /mi-espacio o /seguimientos (igual que
// escalateSlaAlerts, sin cron). Cada seguimiento avisa una vez: alertedAt
// se "reclama" con un updateMany condicionado, así dos cargas concurrentes
// no duplican correo. Un correo por persona con todos los suyos del día.
import { prisma } from "./db";
import { notifyFollowUps } from "./email";
import { chileDateKey, DAY } from "./dates";

const person = { select: { email: true, isActive: true } } as const;

export async function alertDueFollowUps(): Promise<void> {
  const todayKey = chileDateKey(new Date());
  // +1 día de holgura en el filtro de base; el corte exacto es por día Chile.
  const candidates = await prisma.followUp.findMany({
    where: { doneAt: null, alertedAt: null, dueDate: { lte: new Date(Date.now() + DAY) } },
    select: {
      id: true,
      text: true,
      dueDate: true,
      owner: person,
      assignee: person,
      participants: { select: { user: person } },
    },
    orderBy: { dueDate: "asc" },
  });

  const byRecipient = new Map<string, string[]>();
  for (const f of candidates) {
    if (chileDateKey(f.dueDate) > todayKey) continue;
    const lead = [f.assignee, f.owner].find((u) => u.isActive)?.email;
    const to = new Set(
      [lead, ...f.participants.filter((p) => p.user.isActive).map((p) => p.user.email)].filter(
        (e): e is string => !!e,
      ),
    );
    if (to.size === 0) continue;
    const claimed = await prisma.followUp.updateMany({
      where: { id: f.id, alertedAt: null },
      data: { alertedAt: new Date() },
    });
    if (claimed.count === 0) continue;
    for (const email of to) byRecipient.set(email, [...(byRecipient.get(email) ?? []), f.text]);
  }
  for (const [to, texts] of byRecipient) await notifyFollowUps({ to, texts });
}
