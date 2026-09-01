import { prisma } from "./db";

// Rec. #36 — bolsa de horas con ciclos automáticos, arrastre con
// vencimiento y horas extra sin bloqueo. Ver docs/integracion-codiatask
// y el roadmap para el detalle de la regla de negocio.
//
// Los ciclos automáticos NUNCA se guardan en la base — se derivan al
// vuelo a partir de contractedHours/cycleMonths/cycleStartDate. Así el
// saldo es siempre exacto sin depender de que un cron se haya ejecutado.
// Lo único que sí es un dato real son los ajustes manuales
// (HoursAdjustment), que no vencen.

const CARRYOVER_MONTHS = 3;
const EPS = 1e-6;

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

type ClientCycleFields = {
  id: string;
  contractedHours: number;
  cycleMonths: number;
  cycleStartDate: Date | null;
  createdAt: Date;
};

type Grant = {
  hours: number;
  grantedAt: Date;
  expiresAt: Date | null; // null = ajuste manual, nunca vence
  label: string;
};

export function cycleGrants(client: ClientCycleFields, uptoDate: Date): Grant[] {
  const perCycle = client.contractedHours;
  if (perCycle <= 0) return [];
  const months = Math.max(1, Math.floor(client.cycleMonths) || 1);
  const anchor = client.cycleStartDate ?? client.createdAt;

  const grants: Grant[] = [];
  let cursor = new Date(anchor);
  let guard = 0;
  while (cursor <= uptoDate && guard < 1000) {
    grants.push({
      hours: perCycle,
      grantedAt: new Date(cursor),
      expiresAt: addMonths(cursor, CARRYOVER_MONTHS),
      label: `Ciclo desde ${cursor.toISOString().slice(0, 10)}`,
    });
    cursor = addMonths(cursor, months);
    guard++;
  }
  return grants;
}

export type LedgerResult = {
  available: number;
  extraHours: number;
  expiring: { hours: number; expiresAt: Date }[];
};

export function computeLedger(opts: {
  grants: Grant[];
  adjustments: { hours: number; createdAt: Date }[];
  timeEntries: { hours: number; date: Date }[];
  asOf: Date;
}): LedgerResult {
  const manual: Grant[] = opts.adjustments.map((a) => ({
    hours: a.hours,
    grantedAt: a.createdAt,
    expiresAt: null,
    label: "Ajuste manual",
  }));
  const grants = [...opts.grants, ...manual].sort(
    (a, b) => a.grantedAt.getTime() - b.grantedAt.getTime(),
  );
  const remaining = grants.map((g) => g.hours);

  const entries = [...opts.timeEntries].sort((a, b) => a.date.getTime() - b.date.getTime());
  let extraHours = 0;

  for (const entry of entries) {
    let need = entry.hours;
    for (let i = 0; i < grants.length && need > EPS; i++) {
      if (remaining[i] <= EPS) continue;
      const g = grants[i];
      if (g.grantedAt > entry.date) continue;
      if (g.expiresAt && g.expiresAt < entry.date) continue;
      const take = Math.min(need, remaining[i]);
      remaining[i] -= take;
      need -= take;
    }
    if (need > EPS) extraHours += need;
  }

  let available = 0;
  const expiring: { hours: number; expiresAt: Date }[] = [];
  grants.forEach((g, i) => {
    if (remaining[i] <= EPS) return;
    if (g.expiresAt && g.expiresAt < opts.asOf) return; // venció sin usarse, se pierde
    available += remaining[i];
    if (g.expiresAt) expiring.push({ hours: remaining[i], expiresAt: g.expiresAt });
  });
  expiring.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());

  return { available, extraHours, expiring };
}

function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

// Punto de entrada único para las pantallas: recibe uno o varios
// clientes ya cargados (evita duplicar el fetch de Client) y devuelve
// el ledger de cada uno con solo 2 queries en total, sin importar
// cuántos clientes sean.
export async function getHoursSummaries(
  clients: ClientCycleFields[],
  asOf: Date = new Date(),
): Promise<Map<string, LedgerResult & { nextRenewalAt: Date | null }>> {
  const ids = clients.map((c) => c.id);
  const [adjustments, timeEntries] = ids.length
    ? await Promise.all([
        prisma.hoursAdjustment.findMany({
          where: { clientId: { in: ids } },
          select: { clientId: true, hours: true, createdAt: true },
        }),
        prisma.timeEntry.findMany({
          where: { request: { clientId: { in: ids } } },
          select: { hours: true, date: true, request: { select: { clientId: true } } },
        }),
      ])
    : [[], []];

  const adjByClient = groupBy(adjustments, (a) => a.clientId);
  const entriesByClient = groupBy(timeEntries, (t) => t.request.clientId);

  const result = new Map<string, LedgerResult & { nextRenewalAt: Date | null }>();
  for (const client of clients) {
    const grants = cycleGrants(client, asOf);
    const ledger = computeLedger({
      grants,
      adjustments: (adjByClient[client.id] ?? []).map((a) => ({
        hours: a.hours,
        createdAt: a.createdAt,
      })),
      timeEntries: (entriesByClient[client.id] ?? []).map((t) => ({
        hours: t.hours,
        date: t.date,
      })),
      asOf,
    });
    const lastGrant = grants[grants.length - 1];
    const months = Math.max(1, Math.floor(client.cycleMonths) || 1);
    const nextRenewalAt = lastGrant ? addMonths(lastGrant.grantedAt, months) : null;
    result.set(client.id, { ...ledger, nextRenewalAt });
  }
  return result;
}
