import { prisma } from "./db";
import { getStatuses } from "./statuses";
import { notifyTeam } from "./email";

type Linked = { status: string; deletedAt: Date | null; subtasks: { status: string }[] };

// Un seguimiento con tareas vinculadas se resuelve solo cuando TODAS ellas
// y sus subtareas están en un estado final (las eliminadas no cuentan).
export function allTasksDone(tasks: (Linked | null)[], finals: Set<string>): boolean {
  const live = tasks.filter((t): t is Linked => !!t && !t.deletedAt);
  return live.length > 0 && live.every((t) => finals.has(t.status) && t.subtasks.every((s) => finals.has(s.status)));
}

// Llamar tras finalizar tareas. Revisa los seguimientos abiertos vinculados a
// ellas o a su tarea padre (finalizar una subtarea puede completar al padre).
// Reabrir la tarea después NO reabre el seguimiento.
export async function autoResolveFollowUps(requestIds: string[]) {
  if (requestIds.length === 0) return;
  const parents = await prisma.request.findMany({
    where: { id: { in: requestIds }, parentId: { not: null } },
    select: { parentId: true },
  });
  const ids = [...new Set([...requestIds, ...parents.map((p) => p.parentId!)])];
  const task = {
    select: { status: true, deletedAt: true, subtasks: { where: { deletedAt: null }, select: { status: true } } },
  } as const;
  const candidates = await prisma.followUp.findMany({
    where: { doneAt: null, OR: [{ requestId: { in: ids } }, { extraRequests: { some: { id: { in: ids } } } }] },
    select: { id: true, text: true, owner: { select: { email: true } }, request: task, extraRequests: task },
  });
  if (candidates.length === 0) return;
  const finals = new Set((await getStatuses()).filter((s) => s.isFinal).map((s) => s.code));
  for (const f of candidates) {
    if (!allTasksDone([f.request, ...f.extraRequests], finals)) continue;
    const { count } = await prisma.followUp.updateMany({
      where: { id: f.id, doneAt: null },
      data: { doneAt: new Date(), doneById: null, doneAuto: true },
    });
    if (count)
      await notifyTeam({
        to: f.owner.email,
        url: "/seguimientos",
        title: "Seguimiento resuelto automáticamente",
        body: `Sus tareas vinculadas se completaron: ${f.text.slice(0, 200)}`,
      });
  }
}
