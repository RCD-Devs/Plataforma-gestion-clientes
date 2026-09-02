// Alertas de bolsa de horas agotándose (Rmap #17). Se evalúa al cargar
// /bolsa — la página que ya calcula el ledger de cada cliente, sin cron
// ni conexión persistente (mismo enfoque que lib/nudges.ts). Umbral: menos
// del 20% de la bolsa por ciclo disponible, avisado una vez por semana al
// Coordinador de cuenta del cliente.
import { prisma } from "./db";
import { getHoursSummaries } from "./hoursLedger";
import { notifyTeam } from "./email";
import { hoursLabel } from "./format";
import { mondayOf } from "./dates";

const THRESHOLD_PCT = 20;

export async function checkHoursAlerts(
  clients: {
    id: string;
    name: string;
    contractedHours: number;
    cycleMonths: number;
    cycleStartDate: Date | null;
    createdAt: Date;
    accountManagerId: string | null;
  }[],
  summaries: Awaited<ReturnType<typeof getHoursSummaries>>,
): Promise<void> {
  const managerIds = [...new Set(clients.map((c) => c.accountManagerId).filter((v): v is string => !!v))];
  if (managerIds.length === 0) return;

  const managers = await prisma.user.findMany({
    where: { id: { in: managerIds } },
    select: { id: true, email: true },
  });
  const emailByManager = new Map(managers.map((m) => [m.id, m.email]));

  const below = clients.filter((c) => {
    if (c.contractedHours <= 0 || !c.accountManagerId) return false;
    const ledger = summaries.get(c.id);
    if (!ledger) return false;
    return (ledger.available / c.contractedHours) * 100 < THRESHOLD_PCT;
  });
  if (below.length === 0) return;

  const weekKey = mondayOf(new Date());
  const already = await prisma.hoursAlertLog.findMany({
    where: { clientId: { in: below.map((c) => c.id) }, weekKey },
    select: { clientId: true },
  });
  const alerted = new Set(already.map((a) => a.clientId));

  for (const c of below) {
    if (alerted.has(c.id)) continue;
    const email = emailByManager.get(c.accountManagerId!);
    if (!email) continue;
    const ledger = summaries.get(c.id)!;
    const pct = Math.round((ledger.available / c.contractedHours) * 100);
    await notifyTeam({
      to: email,
      title: `Bolsa de horas baja: ${c.name}`,
      body: `${c.name} tiene ${hoursLabel(ledger.available)} disponibles (${pct}% de su bolsa por ciclo). Revisa si conviene avisar al cliente o ajustar el saldo.`,
    });
    await prisma.hoursAlertLog.create({ data: { clientId: c.id, weekKey } }).catch(() => {
      // Carrera con otra request en la misma semana — el @@unique ya lo cubrió.
    });
  }
}
