import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalShell, shellProps } from "@/components/portal/PortalShell";
import { requirePortalUser } from "@/lib/portal";
import { loadProjectInsights } from "@/lib/projectInsights";
import { budgetStatus } from "@/lib/projectBudget";
import { DelayComparison, ProjectGantt, StageComparison } from "@/components/ProjectTimeline";
import { Bar } from "@/components/ui";
import { hoursLabel, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalProyectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePortalUser();
  const insights = await loadProjectInsights(id);
  // Un cliente solo ve proyectos propios (y no archivados).
  if (!insights || insights.project.clientId !== ctx.client.id || insights.project.archivedAt) notFound();
  const { project, timeline, hoursByRequest, consumedHours, finalCodes } = insights;

  const done = project.requests.filter((r) => finalCodes.has(r.status)).length;
  const b = budgetStatus({
    estimatedHours: project.estimatedHours,
    consumedHours,
    startDate: project.startDate,
    endDate: project.endDate,
    done: project.requests.length > 0 && done === project.requests.length,
  });
  const taskHref = (key: string) => `/portal/solicitud/${key}`;

  return (
    <PortalShell {...shellProps(ctx)}>
      <Link href="/portal/proyectos" className="text-sm text-[#08a89f] hover:underline">
        ← Proyectos
      </Link>
      <h1 className="mb-4 mt-2 font-brand text-lg font-semibold">{project.name}</h1>

      <div className="space-y-6">
        <section className="rounded-2xl border border-[#e4e8ec] bg-white p-5">
          <h2 className="mb-3 font-brand text-sm font-semibold">Lo propuesto vs. lo que llevamos</h2>
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <div className="text-xs text-[#5d6b77]">Avance de tareas</div>
              <div className="mt-1 text-2xl font-semibold">
                {done} <span className="text-sm font-normal text-[#5d6b77]">de {project.requests.length}</span>
              </div>
              <div className="mt-2">
                <Bar pct={project.requests.length ? (done / project.requests.length) * 100 : 0} />
              </div>
            </div>
            <div>
              <div className="text-xs text-[#5d6b77]">Horas</div>
              {b.hasHours ? (
                <>
                  <div className="mt-1 text-2xl font-semibold">
                    {hoursLabel(consumedHours)}{" "}
                    <span className="text-sm font-normal text-[#5d6b77]">de {hoursLabel(project.estimatedHours!)}</span>
                  </div>
                  <div className="mt-2">
                    <Bar pct={b.pctUsed} color={b.redHours > 0 ? "#d21f3c" : b.pctUsed >= 80 ? "#c97416" : "#0e9f6e"} />
                  </div>
                  <div className="mt-1 text-xs">
                    {b.redHours > 0 ? (
                      <span className="font-semibold text-[#d21f3c]">{hoursLabel(b.redHours)} sobre lo estimado</span>
                    ) : (
                      <span className="text-[#5d6b77]">Restan {hoursLabel(b.remainingHours)}</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="mt-1 text-sm text-[#7f7f7f]">{hoursLabel(consumedHours)} consumidas · sin estimación</div>
              )}
            </div>
            <div>
              <div className="text-xs text-[#5d6b77]">Plazo</div>
              {b.hasDates ? (
                <>
                  <div className="mt-1 text-2xl font-semibold">
                    día {b.elapsedDays} <span className="text-sm font-normal text-[#5d6b77]">de {b.totalDays}</span>
                  </div>
                  <div className="mt-2">
                    <Bar pct={(b.elapsedDays / b.totalDays) * 100} color={b.lateDays > 0 ? "#d21f3c" : "#0bdbcf"} />
                  </div>
                  <div className="mt-1 text-xs text-[#5d6b77]">
                    {shortDate(project.startDate)} → {shortDate(project.endDate)}
                    {b.lateDays > 0 && <span className="ml-1 font-semibold text-[#d21f3c]">· {b.lateDays} d de atraso</span>}
                  </div>
                </>
              ) : (
                <div className="mt-1 text-sm text-[#7f7f7f]">Sin fechas definidas</div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#e4e8ec] bg-white p-5">
          <h2 className="mb-3 font-brand text-sm font-semibold">Carta Gantt</h2>
          <ProjectGantt timeline={timeline} taskHref={taskHref} />
        </section>

        <section className="rounded-2xl border border-[#e4e8ec] bg-white p-5">
          <h2 className="mb-3 font-brand text-sm font-semibold">Comparativo por etapa: propuesto vs. real</h2>
          <StageComparison timeline={timeline} hoursByRequest={hoursByRequest} />
        </section>

        <section className="rounded-2xl border border-[#e4e8ec] bg-white p-5">
          <h2 className="mb-3 font-brand text-sm font-semibold">Comparativo de demoras</h2>
          <DelayComparison timeline={timeline} hoursByRequest={hoursByRequest} taskHref={taskHref} />
        </section>
      </div>
    </PortalShell>
  );
}
