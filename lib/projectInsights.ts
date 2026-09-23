import { prisma } from "./db";
import { getStatuses } from "./statuses";
import { buildProjectTimeline } from "./projectTimeline";
import { idFromSlug, withSlug } from "./slug";

// URL de un proyecto: /proyectos/{cliente}/{proyecto}, cada segmento con su
// slug si ya lo tiene, o el híbrido id-nombre si todavía no (recién creado
// antes de que corra el backfill).
export function projectHref(
  project: { id: string; slug: string | null; name: string },
  client: { id: string; slug: string | null; name: string },
): string {
  const clientSeg = client.slug ?? withSlug(client.id, client.name);
  const projectSeg = project.slug ?? withSlug(project.id, project.name);
  return `/proyectos/${clientSeg}/${projectSeg}`;
}

// /proyectos/{cliente}/{proyecto} al id real del proyecto. El slug de
// proyecto es único POR CLIENTE, no global, así que se busca por ambos a
// la vez; si no calza (el segmento de cliente quedó desactualizado o es
// el híbrido id-nombre de una etapa anterior), se ignora y se busca el
// proyecto solo por su propio segmento.
export async function resolveProjectPath(clientParam: string, projectParam: string): Promise<string | null> {
  const bySlugs = await prisma.project.findFirst({
    where: { slug: projectParam, client: { slug: clientParam } },
    select: { id: true },
  });
  if (bySlugs) return bySlugs.id;
  return resolveProjectId(projectParam);
}

// Compat: un solo segmento (/proyectos/{param}) — formato de antes de
// anidar por cliente. Sigue resolviendo slug puro, híbrido id-nombre, o
// el id solo, para lo que haya quedado guardado como link.
export async function resolveProjectId(param: string): Promise<string | null> {
  const bySlug = await prisma.project.findFirst({ where: { slug: param }, select: { id: true } });
  if (bySlug) return bySlug.id;
  const byId = await prisma.project.findUnique({ where: { id: idFromSlug(param) }, select: { id: true } });
  return byId?.id ?? null;
}

// Carga un proyecto con todo lo necesario para ficha/portal: horas
// consumidas y línea de tiempo (Gantt + comparativo de demoras).
export async function loadProjectInsights(projectId: string) {
  const [project, statuses] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: { select: { id: true, name: true, slug: true, accountManagerId: true } },
        stages: { orderBy: { sortOrder: "asc" } },
        // Archivadas incluidas: son histórico y sus horas siguen contando.
        requests: {
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
