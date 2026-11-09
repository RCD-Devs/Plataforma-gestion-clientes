import { prisma } from "./db";
import { chileDateKey } from "./dates";
import { HOLIDAYS_CL } from "./holidaysCL";
import { DEFAULT_WORK_HOURS, shiftKey, weekdayIndex } from "./workSchedule";

// Reporte de dedicación (planilla de Google Sheets que empuja el cron
// diario): una fila por persona × cliente × mes, del equipo Experiencia
// Digital, desde octubre 2026 hasta el mes en curso.
//  - Dedicación real: horas registradas. Perfil/seniority/servicio/continua
//    salen de la FOTO guardada en cada TimeEntry al registrar; si cambian a
//    mitad de mes, la persona queda en dos filas.
//  - Dedicación vendida: horas por persona de las etapas de proyectos con
//    cubicación confirmada, repartidas en los meses de la etapa según horas
//    hábiles (lun–jue 8,5 h, vie 6 h, sin feriados). Va en la fila más
//    reciente de esa persona/cliente/mes; sin horas registradas, fila nueva
//    con los valores actuales. Las bolsas de horas no tienen vendida.

export const REPORT_START = "2026-10-01";
export const REPORT_TEAM = "Experiencia Digital";
export const REPORT_HEADER = [
  "Periodo",
  "Empresa",
  "Cliente",
  "Continua",
  "Área",
  "Perfil",
  "SENIORITY",
  "Servicio",
  "Dedicacion vendida",
  "Dedicacion Real",
  "Nombre",
];

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const periodLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

// Más de un equipo = "Continuidad"; uno = "Rompecabeza <equipo>".
export function continuaLabel(teamNames: string[]): string | null {
  if (teamNames.length > 1) return "Continuidad";
  return teamNames.length === 1 ? `Rompecabeza ${teamNames[0]}` : null;
}

// Horas hábiles de cada mes ("YYYY-MM") entre dos días "YYYY-MM-DD" inclusive.
export function workHoursByMonth(startKey: string, endKey: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let d = startKey; d <= endKey; d = shiftKey(d, 1)) {
    const h = HOLIDAYS_CL[d] ? 0 : DEFAULT_WORK_HOURS[weekdayIndex(d)];
    if (h) out.set(d.slice(0, 7), (out.get(d.slice(0, 7)) ?? 0) + h);
  }
  return out;
}

// Reparte las horas de una etapa en sus meses, proporcional a horas hábiles.
export function spreadByMonth(hours: number, startKey: string, endKey: string): Map<string, number> {
  const wh = workHoursByMonth(startKey, endKey);
  const total = [...wh.values()].reduce((a, b) => a + b, 0);
  const out = new Map<string, number>();
  if (total > 0) for (const [m, h] of wh) out.set(m, (hours * h) / total);
  return out;
}

// Lo que se guarda en un TimeEntry al crearlo.
export async function timeEntrySnapshot(userId: string, requestId: string) {
  const [user, req] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { perfil: true, seniority: true, teamId: true } }),
    prisma.request.findUnique({
      where: { id: requestId },
      select: { client: { select: { servicio: true, teams: { select: { name: true } } } } },
    }),
  ]);
  return {
    snapPerfil: user?.perfil ?? null,
    snapSeniority: user?.seniority ?? null,
    snapTeamId: user?.teamId ?? null,
    snapServicio: req?.client.servicio ?? null,
    snapContinua: continuaLabel(req?.client.teams.map((t) => t.name) ?? []),
  };
}

export type ReportEntry = {
  month: string;
  dayKey: string;
  clientId: string;
  userId: string;
  hours: number;
  perfil: string | null;
  seniority: number | null;
  servicio: string | null;
  continua: string | null;
};
type Person = { nombre: string; perfil: string | null; seniority: number | null };
type ClientInfo = { name: string; servicio: string | null; continua: string | null };
export type Cell = string | number;

// Agrupa y arma las filas (puro, para poder testearlo).
export function buildRows(opts: {
  entries: ReportEntry[];
  sold: Map<string, number>; // "month|clientId|userId" → horas vendidas
  people: Map<string, Person>;
  clients: Map<string, ClientInfo>;
}): Cell[][] {
  type Row = {
    month: string;
    clientId: string;
    userId: string;
    perfil: string | null;
    seniority: number | null;
    servicio: string | null;
    continua: string | null;
    real: number;
    sold: number | null;
    lastDay: string;
  };
  const rows = new Map<string, Row>();
  for (const e of opts.entries) {
    const k = [e.month, e.clientId, e.userId, e.perfil, e.seniority, e.servicio, e.continua].join("|");
    const r = rows.get(k) ?? { ...e, real: 0, sold: null, lastDay: "" };
    r.real += e.hours;
    if (e.dayKey > r.lastDay) r.lastDay = e.dayKey;
    rows.set(k, r);
  }
  for (const [key, hours] of opts.sold) {
    const [month, clientId, userId] = key.split("|");
    const latest = [...rows.values()]
      .filter((r) => r.month === month && r.clientId === clientId && r.userId === userId)
      .sort((a, b) => b.lastDay.localeCompare(a.lastDay))[0];
    if (latest) {
      latest.sold = hours;
      continue;
    }
    const p = opts.people.get(userId);
    const c = opts.clients.get(clientId);
    if (!p || !c) continue;
    rows.set(key, {
      month, clientId, userId, perfil: p.perfil, seniority: p.seniority, servicio: c.servicio,
      continua: c.continua, real: 0, sold: hours, lastDay: "",
    });
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return [...rows.values()]
    .map((r) => ({ r, client: opts.clients.get(r.clientId)?.name ?? "", nombre: opts.people.get(r.userId)?.nombre ?? "" }))
    .sort(
      (a, b) =>
        a.r.month.localeCompare(b.r.month) || a.client.localeCompare(b.client) || a.nombre.localeCompare(b.nombre),
    )
    .map(({ r, client, nombre }) => [
      periodLabel(r.month),
      "Rompecabeza",
      client,
      r.continua ?? "",
      REPORT_TEAM,
      r.perfil ?? "",
      r.seniority ?? "",
      r.servicio ?? "",
      r.sold == null ? "" : round(r.sold),
      r.real ? round(r.real) : "",
      nombre,
    ]);
}

export async function loadDedicacionRows(now = new Date()): Promise<Cell[][]> {
  const team = await prisma.team.findFirst({ where: { name: REPORT_TEAM }, select: { id: true } });
  if (!team) return [];
  const currentMonth = chileDateKey(now).slice(0, 7);
  const from = new Date(`${REPORT_START}T00:00:00-03:00`);

  const [users, clients, entries, stages] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, nombres: true, apellidos: true, perfil: true, seniority: true, teamId: true },
    }),
    prisma.client.findMany({ select: { id: true, name: true, servicio: true, teams: { select: { name: true } } } }),
    prisma.timeEntry.findMany({
      where: { date: { gte: from } },
      select: {
        hours: true, date: true, userId: true, snapPerfil: true, snapSeniority: true, snapTeamId: true,
        snapServicio: true, snapContinua: true, request: { select: { clientId: true } },
      },
    }),
    prisma.projectStage.findMany({
      where: {
        project: { baselineAt: { not: null } },
        startDate: { not: null },
        endDate: { gte: from },
        allocations: { some: {} },
      },
      select: { startDate: true, endDate: true, project: { select: { clientId: true } }, allocations: true },
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const people = new Map(
    users.map((u) => [
      u.id,
      {
        nombre: [u.apellidos, u.nombres].filter(Boolean).join(" ").trim() || u.name,
        perfil: u.perfil,
        seniority: u.seniority,
      },
    ]),
  );
  const clientInfo = new Map(
    clients.map((c) => [c.id, { name: c.name, servicio: c.servicio, continua: continuaLabel(c.teams.map((t) => t.name)) }]),
  );

  const reportEntries: ReportEntry[] = [];
  for (const e of entries) {
    const u = userById.get(e.userId);
    const c = clientInfo.get(e.request.clientId);
    if ((e.snapTeamId ?? u?.teamId) !== team.id) continue;
    const dayKey = chileDateKey(e.date);
    if (dayKey.slice(0, 7) > currentMonth) continue;
    reportEntries.push({
      month: dayKey.slice(0, 7),
      dayKey,
      clientId: e.request.clientId,
      userId: e.userId,
      hours: e.hours,
      perfil: e.snapPerfil ?? u?.perfil ?? null,
      seniority: e.snapSeniority ?? u?.seniority ?? null,
      servicio: e.snapServicio ?? c?.servicio ?? null,
      continua: e.snapContinua ?? c?.continua ?? null,
    });
  }

  const sold = new Map<string, number>();
  for (const s of stages) {
    if (!s.startDate || !s.endDate) continue;
    for (const a of s.allocations) {
      if (userById.get(a.userId)?.teamId !== team.id) continue;
      for (const [month, h] of spreadByMonth(a.hours, chileDateKey(s.startDate), chileDateKey(s.endDate))) {
        if (month < REPORT_START.slice(0, 7) || month > currentMonth) continue;
        const k = `${month}|${s.project.clientId}|${a.userId}`;
        sold.set(k, (sold.get(k) ?? 0) + h);
      }
    }
  }

  return buildRows({ entries: reportEntries, sold, people, clients: clientInfo });
}
