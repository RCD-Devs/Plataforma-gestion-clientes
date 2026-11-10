import { prisma } from "./db";
import { chileDateKey } from "./dates";
import { replaceSheetTab } from "./googleSheets";

// Reporte de dedicación (planilla de Google Sheets que empuja el cron
// diario): una fila por persona × cliente × mes, del equipo Experiencia
// Digital, desde octubre 2026 hasta el mes en curso. Dedicación real =
// horas registradas. Servicio/continua salen de la FOTO guardada en cada
// TimeEntry al registrar; si cambian a mitad de mes, quedan dos filas.
// Cliente = su «nombre en reporte» si lo tiene, si no el de RGC.

export const REPORT_START = "2026-10-01";
export const REPORT_TEAM = "Experiencia Digital";
export const REPORT_HEADER = [
  "Periodo",
  "Empresa",
  "Cliente",
  "Continua",
  "Área",
  "Servicio",
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
  clientId: string;
  userId: string;
  hours: number;
  servicio: string | null;
  continua: string | null;
};
export type Cell = string | number;

// Agrupa y arma las filas (puro, para poder testearlo).
export function buildRows(opts: {
  entries: ReportEntry[];
  people: Map<string, string>; // userId → "Apellidos Nombres"
  clients: Map<string, string>; // clientId → nombre en la planilla
}): Cell[][] {
  const rows = new Map<string, ReportEntry>();
  for (const e of opts.entries) {
    const k = [e.month, e.clientId, e.userId, e.servicio, e.continua].join("|");
    const r = rows.get(k);
    if (r) r.hours += e.hours;
    else rows.set(k, { ...e });
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return [...rows.values()]
    .map((r) => ({ r, client: opts.clients.get(r.clientId) ?? "", nombre: opts.people.get(r.userId) ?? "" }))
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
      r.servicio ?? "",
      r.hours ? round(r.hours) : "",
      nombre,
    ]);
}

export async function loadDedicacionRows(now = new Date()): Promise<Cell[][]> {
  const team = await prisma.team.findFirst({ where: { name: REPORT_TEAM }, select: { id: true } });
  if (!team) return [];
  const currentMonth = chileDateKey(now).slice(0, 7);
  const from = new Date(`${REPORT_START}T00:00:00-03:00`);

  const [users, clients, entries] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, nombres: true, apellidos: true, teamId: true } }),
    prisma.client.findMany({
      select: { id: true, name: true, nombreReporte: true, servicio: true, teams: { select: { name: true } } },
    }),
    prisma.timeEntry.findMany({
      where: { date: { gte: from } },
      select: {
        hours: true, date: true, userId: true, snapTeamId: true, snapServicio: true, snapContinua: true,
        request: { select: { clientId: true } },
      },
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const people = new Map(
    users.map((u) => [u.id, [u.apellidos, u.nombres].filter(Boolean).join(" ").trim() || u.name]),
  );
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const reportEntries: ReportEntry[] = [];
  for (const e of entries) {
    if ((e.snapTeamId ?? userById.get(e.userId)?.teamId) !== team.id) continue;
    const month = chileDateKey(e.date).slice(0, 7);
    if (month > currentMonth) continue;
    const c = clientById.get(e.request.clientId);
    reportEntries.push({
      month,
      clientId: e.request.clientId,
      userId: e.userId,
      hours: e.hours,
      servicio: e.snapServicio ?? c?.servicio ?? null,
      continua: e.snapContinua ?? (c ? continuaLabel(c.teams.map((t) => t.name)) : null),
    });
  }

  return buildRows({
    entries: reportEntries,
    people,
    clients: new Map(clients.map((c) => [c.id, c.nombreReporte || c.name])),
  });
}

// Sin las variables no hace nada. Si falla, la planilla queda con los datos
// del día anterior y el error queda en los logs — no corta lo demás.
export async function syncDedicacion(): Promise<number | "sin configurar" | "error"> {
  const sheetId = process.env.DEDICACION_SHEET_ID;
  if (!sheetId || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return "sin configurar";
  try {
    const rows = await loadDedicacionRows();
    await replaceSheetTab(sheetId, process.env.DEDICACION_SHEET_TAB || "Dedicación", [REPORT_HEADER, ...rows]);
    return rows.length;
  } catch (err) {
    console.error("[dedicación] planilla de dedicación:", err);
    return "error";
  }
}
