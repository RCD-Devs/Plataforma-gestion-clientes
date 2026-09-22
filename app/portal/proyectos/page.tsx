import Link from "next/link";
import { prisma } from "@/lib/db";
import { PortalShell, shellProps } from "@/components/portal/PortalShell";
import { withSlug } from "@/lib/slug";
import { requirePortalUser } from "@/lib/portal";
import { getStatuses } from "@/lib/statuses";
import { budgetStatus } from "@/lib/projectBudget";
import { Bar } from "@/components/ui";
import { hoursLabel, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalProyectosPage() {
  const ctx = await requirePortalUser();
  const [projects, statuses] = await Promise.all([
    prisma.project.findMany({
      where: { clientId: ctx.client.id, archivedAt: null },
      include: {
        requests: {
          where: { archivedAt: null },
          select: { status: true, timeEntries: { select: { hours: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    getStatuses(),
  ]);
  const finalCodes = new Set(statuses.filter((s) => s.isFinal).map((s) => s.code));

  return (
    <PortalShell {...shellProps(ctx)}>
      <h1 className="mb-3 font-brand text-sm font-semibold">Proyectos</h1>
      {projects.length === 0 ? (
        <div className="rounded-2xl border border-[#e4e8ec] bg-white p-10 text-center text-sm text-[#7f7f7f]">
          Aún no hay proyectos registrados para tu cuenta.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => {
            const consumed = p.requests.reduce((a, r) => a + r.timeEntries.reduce((x, t) => x + t.hours, 0), 0);
            const done = p.requests.filter((r) => finalCodes.has(r.status)).length;
            const b = budgetStatus({
              estimatedHours: p.estimatedHours,
              consumedHours: consumed,
              startDate: p.startDate,
              endDate: p.endDate,
              done: p.requests.length > 0 && done === p.requests.length,
            });
            return (
              <Link
                key={p.id}
                href={`/portal/proyectos/${p.slug ?? withSlug(p.id, p.name)}`}
                className="rounded-2xl border border-[#e4e8ec] bg-white p-5 hover:border-[#0bdbcf]"
              >
                <div className="font-semibold">{p.name}</div>
                <div className="mt-0.5 text-xs text-[#5d6b77]">
                  {p.startDate && p.endDate ? `${shortDate(p.startDate)} → ${shortDate(p.endDate)}` : "Sin fechas definidas"}
                  {b.lateDays > 0 && <span className="ml-2 font-semibold text-[#d21f3c]">{b.lateDays} d de atraso</span>}
                </div>
                <div className="mt-3 text-xs text-[#5d6b77]">
                  {done} de {p.requests.length} tareas finalizadas
                </div>
                <Bar pct={p.requests.length ? (done / p.requests.length) * 100 : 0} />
                {b.hasHours && (
                  <div className="mt-3 text-xs text-[#5d6b77]">
                    Horas: {hoursLabel(consumed)} de {hoursLabel(p.estimatedHours!)}
                    {b.redHours > 0 && <span className="ml-1 font-semibold text-[#d21f3c]">(+{hoursLabel(b.redHours)} sobre lo estimado)</span>}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </PortalShell>
  );
}
