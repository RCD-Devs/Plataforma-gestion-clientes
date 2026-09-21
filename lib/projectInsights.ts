import { prisma } from "./db";
import { getStatuses } from "./statuses";
import { buildProjectTimeline } from "./projectTimeline";

// Carga un proyecto con todo lo necesario para ficha/portal: horas
// consumidas y línea de tiempo (Gantt + comparativo de demoras).
export async function loadProjectInsights(projectId: string) {
  const [project, statuses] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: { select: { id: true, name: true, accountManagerId: true } },
        stages: { orderBy: { sortOrder: "asc" } },
        requests: {
          where: { archivedAt: null },
          orderBy: { createdAt: "asc" },
          include: {
            timeEntries: { select: { hours: true } },
            statusChanges: { select: { status: true, at: true }, orderBy: { at: "asc" } },
          },
        },
      },
    }),
    getStatuses(),
  ]);
  if (!project) return null;

  const finalCodes = new Set(statuses.filter((s) => s.isFinal).map((s) => s.code));
  const waitCodes = new Set(statuses.filter((s) => s.waitsOnClient).map((s) => s.code));
  const hoursByRequest = new Map(
    project.requests.map((r) => [r.id, r.timeEntries.reduce((a, t) => a + t.hours, 0)]),
  );
  const timeline = buildProjectTimeline({
    startDate: project.startDate,
    endDate: project.endDate,
    stages: project.stages,
    requests: project.requests.map((r) => ({
      id: r.id,
      key: r.key,
      title: r.title,
      createdAt: r.createdAt,
      finalizedAt: r.finalizedAt,
      status: r.status,
      stageId: r.stageId,
      changes: r.statusChanges.map((c) => ({ status: c.status, at: c.at })),
    })),
    waitCodes,
    finalCodes,
  });

  return {
    project,
    timeline,
    finalCodes,
    hoursByRequest,
    consumedHours: [...hoursByRequest.values()].reduce((a, h) => a + h, 0),
  };
}

export type ProjectInsights = NonNullable<Awaited<ReturnType<typeof loadProjectInsights>>>;
