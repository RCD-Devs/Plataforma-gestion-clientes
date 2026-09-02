// Escalamiento de SLA (Rmap #18): notifica al responsable cuando una
// solicitud está vencida o vence en el día/mañana. Alcance acotado a
// pedido del dueño del proyecto (2 sep 2026): solo aviso al assignee, sin
// reasignación automática ni cambio de prioridad.
//
// Se evalúa al cargar /mi-espacio, sin cron — cualquier carga de
// cualquier usuario dispara el chequeo global (no solo el de quien mira),
// pero SlaAlertLog garantiza que cada solicitud avisa una sola vez sin
// importar cuántas veces se dispare esta función.
import { prisma } from "./db";
import { getStatuses } from "./statuses";
import { notifyTeam } from "./email";
import { daysFromToday, DAY } from "./dates";

export async function escalateSlaAlerts(): Promise<void> {
  const statuses = await getStatuses();
  const finalCodes = statuses.filter((s) => s.isFinal).map((s) => s.code);

  const tomorrowEnd = new Date(Date.now() + 1 * DAY);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const candidates = await prisma.request.findMany({
    where: {
      archivedAt: null,
      status: { notIn: finalCodes },
      dueDate: { not: null, lte: tomorrowEnd },
      assigneeId: { not: null },
    },
    select: {
      id: true,
      key: true,
      title: true,
      dueDate: true,
      assignee: { select: { email: true } },
    },
  });
  if (candidates.length === 0) return;

  const already = await prisma.slaAlertLog.findMany({
    where: { requestId: { in: candidates.map((c) => c.id) } },
    select: { requestId: true },
  });
  const alerted = new Set(already.map((a) => a.requestId));

  for (const req of candidates) {
    if (alerted.has(req.id) || !req.assignee?.email) continue;
    const days = daysFromToday(req.dueDate!);
    const when =
      days < 0
        ? `vencida hace ${-days} día${days === -1 ? "" : "s"}`
        : days === 0
          ? "vence hoy"
          : "vence mañana";
    await notifyTeam({
      to: req.assignee.email,
      requestId: req.id,
      title: `SLA: ${req.key} ${when}`,
      body: `"${req.title}" ${when} — revísala antes de que se atrase más.`,
    });
    await prisma.slaAlertLog.create({ data: { requestId: req.id } }).catch(() => {
      // Carrera con otra request concurrente — el @@unique ya lo cubrió.
    });
  }
}
