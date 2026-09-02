// Nudges de comportamiento — port de Codia Task (backend/src/services/
// behaviorNudgeService.js). Pese al nombre "IA" en el roadmap original,
// es pura lógica de reglas sobre fechas — cero LLM, cero costo. 4 señales
// sobre las tareas asignadas a un usuario (responsable o colaborador):
// sin horas cargadas, por vencer, sin movimiento, sin comentario propio.
//
// Simplificaciones respecto al original: 1 aviso por usuario por día
// (Codia Task permitía hasta 2 + push SSE en tiempo real) — sin cron ni
// conexión persistente disponible en Vercel serverless, el chequeo corre
// al cargar /mi-espacio. El disparador "analizar a todo el staff" (solo
// superusuario) no se porta — queda para una entrega aparte si hace falta.
import { prisma } from "./db";
import { getStatuses } from "./statuses";
import { DAY } from "./dates";

const TZ = "America/Santiago";
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 18;

export type NudgeKind =
  | "MISSING_TIMES"
  | "DUE_DATES"
  | "STALE_STATUS"
  | "MISSING_COMMENTS";

export type NudgeTask = { id: string; key: string; title: string };

export type NudgeItem = {
  kind: NudgeKind;
  taskCount: number;
  tasks: NudgeTask[]; // vista previa, hasta 5
};

function santiagoParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  const hour = Number(get("hour") === "24" ? "0" : get("hour"));
  const minute = Number(get("minute"));
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  return { weekday, hour, minute, day };
}

function isBusinessHoursSantiago(): boolean {
  const parts = santiagoParts();
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const mins = parts.hour * 60 + parts.minute;
  return mins >= BUSINESS_START_HOUR * 60 && mins < BUSINESS_END_HOUR * 60;
}

function assignedToUserWhere(userId: string) {
  return {
    archivedAt: null,
    OR: [{ assigneeId: userId }, { collaborators: { some: { userId } } }],
  };
}

const NO_SUBTASKS = { subtasks: { none: {} } };
const TASK_SELECT = { id: true, key: true, title: true } as const;

function toItem(kind: NudgeKind, rows: NudgeTask[]): NudgeItem {
  return { kind, taskCount: rows.length, tasks: rows.slice(0, 5) };
}

// Tarea "en revisión"/"en pausa" (siempre cuentan) o final (solo si se
// actualizó en los últimos 45 días — no revivir tareas cerradas hace meses)
// sin ningún registro de horas.
async function missingTimes(userId: string): Promise<NudgeTask[]> {
  const statuses = await getStatuses();
  const finalCodes = new Set(statuses.filter((s) => s.isFinal).map((s) => s.code));
  const midStageCodes = statuses
    .filter((s) => s.code === "EN_REVISION" || s.code === "EN_PAUSA")
    .map((s) => s.code);
  const eligibleCodes = [...midStageCodes, ...finalCodes];
  if (eligibleCodes.length === 0) return [];

  const rows = await prisma.request.findMany({
    where: {
      ...assignedToUserWhere(userId),
      status: { in: eligibleCodes },
      ...NO_SUBTASKS,
      timeEntries: { none: {} },
    },
    select: { ...TASK_SELECT, status: true, updatedAt: true },
  });
  const cutoff = new Date(Date.now() - 45 * DAY);
  return rows.filter((r) => !finalCodes.has(r.status) || r.updatedAt >= cutoff);
}

// Vencidas o por vencer (hoy/mañana), no finalizadas, sin subtareas.
async function dueDates(userId: string): Promise<NudgeTask[]> {
  const statuses = await getStatuses();
  const finalCodes = statuses.filter((s) => s.isFinal).map((s) => s.code);
  const tomorrowEnd = new Date();
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  tomorrowEnd.setHours(23, 59, 59, 999);

  return prisma.request.findMany({
    where: {
      ...assignedToUserWhere(userId),
      status: { notIn: finalCodes },
      dueDate: { not: null, lte: tomorrowEnd },
      ...NO_SUBTASKS,
    },
    select: TASK_SELECT,
  });
}

// Sin movimiento hace 3+ días, creada hace 1+ día, no finalizada, sin subtareas.
async function staleStatus(userId: string): Promise<NudgeTask[]> {
  const statuses = await getStatuses();
  const finalCodes = statuses.filter((s) => s.isFinal).map((s) => s.code);
  return prisma.request.findMany({
    where: {
      ...assignedToUserWhere(userId),
      status: { notIn: finalCodes },
      createdAt: { lte: new Date(Date.now() - 1 * DAY) },
      updatedAt: { lte: new Date(Date.now() - 3 * DAY) },
      ...NO_SUBTASKS,
    },
    select: TASK_SELECT,
  });
}

// Creada hace 2+ días, no finalizada, sin subtareas, sin ningún comentario
// del propio usuario todavía.
async function missingComments(userId: string): Promise<NudgeTask[]> {
  const statuses = await getStatuses();
  const finalCodes = statuses.filter((s) => s.isFinal).map((s) => s.code);
  return prisma.request.findMany({
    where: {
      ...assignedToUserWhere(userId),
      status: { notIn: finalCodes },
      createdAt: { lte: new Date(Date.now() - 2 * DAY) },
      ...NO_SUBTASKS,
      comments: { none: { authorId: userId } },
    },
    select: TASK_SELECT,
  });
}

// Orden de prioridad igual al original; "sin comentario" solo dispara con
// 2+ tareas (evita avisar por una sola tarea recién creada).
async function evaluateItems(userId: string): Promise<NudgeItem[]> {
  const [missingTimesRows, dueDatesRows, staleStatusRows, missingCommentsRows] =
    await Promise.all([
      missingTimes(userId),
      dueDates(userId),
      staleStatus(userId),
      missingComments(userId),
    ]);
  const items: NudgeItem[] = [];
  if (missingTimesRows.length >= 1) items.push(toItem("MISSING_TIMES", missingTimesRows));
  if (dueDatesRows.length >= 1) items.push(toItem("DUE_DATES", dueDatesRows));
  if (staleStatusRows.length >= 1) items.push(toItem("STALE_STATUS", staleStatusRows));
  if (missingCommentsRows.length >= 2) items.push(toItem("MISSING_COMMENTS", missingCommentsRows));
  return items;
}

// Punto de entrada — llamar una vez por carga de /mi-espacio. Devuelve
// null si ya se mostró hoy, fuera de horario laboral, o no hay nada que
// avisar. Si hay algo que mostrar, registra el throttle antes de retornar
// (evita mostrarlo de nuevo el resto del día, incluso si el usuario
// recarga la página sin llegar a "ver" el aviso).
export async function getPendingNudge(userId: string): Promise<NudgeItem[] | null> {
  if (!isBusinessHoursSantiago()) return null;

  const day = santiagoParts().day;
  const already = await prisma.nudgeShown.findUnique({
    where: { userId_day: { userId, day } },
  });
  if (already) return null;

  const items = await evaluateItems(userId);
  if (items.length === 0) return null;

  await prisma.nudgeShown.create({ data: { userId, day } }).catch(() => {
    // Carrera con otra request del mismo usuario el mismo día — el
    // @@unique ya garantizó que solo una gana; no hay nada más que hacer.
  });
  return items;
}
