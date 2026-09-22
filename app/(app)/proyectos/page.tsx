import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { projectHref } from "@/lib/projectInsights";
import { getSessionUser } from "@/lib/session";
import { hasAccess, clientScopeWhere } from "@/lib/permissions";
import { getStatuses } from "@/lib/statuses";
import { budgetStatus } from "@/lib/projectBudget";
import { Bar } from "@/components/ui";
import { hoursLabel, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type Badge = { label: string; cls: string };

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasAccess(user.capabilities, "projects.view")) redirect("/mi-espacio");
  const canCreate = hasAccess(user.capabilities, "projects.manage");

  const [projects, statuses] = await Promise.all([
    prisma.project.findMany({
      where: {
        archivedAt: null,
        client: clientScopeWhere(user.capabilities, "projects.view", user.id),
      },
      include: {
        client: { select: { id: true, name: true, slug: true, color: true } },
        _count: { select: { stages: true } },
        requests: {
          where: { archivedAt: null },
          select: { status: true, timeEntries: { select: { hours: true } } },
        },
      },
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    }),
    getStatuses(),
  ]);
  const finalCodes = new Set(statuses.filter((s) => s.isFinal).map((s) => s.code));

  const term = q.trim().toLowerCase();
  const cards = projects
    .filter((p) => !term || `${p.name} ${p.client.name}`.toLowerCase().includes(term))
    .map((p) => {
      const consumed = p.requests.reduce((a, r) => a + r.timeEntries.reduce((x, t) => x + t.hours, 0), 0);
      const done = p.requests.filter((r) => finalCodes.has(r.status)).length;
      const finished = p.requests.length > 0 && done === p.requests.length;
      const b = budgetStatus({
        estimatedHours: p.estimatedHours,
        consumedHours: consumed,
        startDate: p.startDate,
        endDate: p.endDate,
        done: finished,
      });
      const badge: Badge = finished
        ? { label: "Finalizado", cls: "bg-[#e3f6ee] text-[#0a7a52]" }
        : b.redHours > 0 || b.lateDays > 0
          ? { label: "En rojo", cls: "bg-[#fdeef0] text-[#a01830]" }
          : b.hasHours && b.pctUsed >= 80
            ? { label: "Al límite", cls: "bg-[#fdf1e3] text-[#9a5a25]" }
            : p.requests.length === 0 && !b.hasHours && !b.hasDates
              ? { label: "Nuevo", cls: "bg-[#f1f3f4] text-[#5d6b77]" }
              : { label: "En curso", cls: "bg-[#e0fbf9] text-[#065f5a]" };
      return { p, consumed, done, b, badge };
    });

  const byClient = new Map<string, { client: (typeof projects)[number]["client"]; items: typeof cards }>();
  for (const c of cards) {
    const g = byClient.get(c.p.client.id) ?? { client: c.p.client, items: [] };
    g.items.push(c);
    byClient.set(c.p.client.id, g);
  }
  const summary = {
    total: cards.length,
    red: cards.filter((c) => c.badge.label === "En rojo").length,
    finished: cards.filter((c) => c.badge.label === "Finalizado").length,
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e8ec] bg-white px-6 py-3">
        <div>
          <h1 className="font-brand text-base font-semibold">Proyectos</h1>
          <p className="text-xs text-[#5d6b77]">
            {summary.total} proyecto{summary.total === 1 ? "" : "s"}
            {summary.red > 0 && <span className="font-semibold text-[#a01830]"> · {summary.red} en rojo</span>}
            {summary.finished > 0 && ` · ${summary.finished} finalizado${summary.finished === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form className="flex items-center">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar proyecto o cliente…"
              className="w-56 rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]"
            />
          </form>
          {canCreate && (
            <Link
              href="/proyectos/nuevo"
              className="rounded-lg bg-[#0bdbcf] px-3 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]"
            >
              + Nuevo proyecto
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-8 overflow-y-auto p-6">
        {byClient.size === 0 && (
          <div className="rounded-2xl border border-dashed border-[#d5dbe1] bg-white px-6 py-14 text-center">
            <div className="text-3xl" aria-hidden>
              🗂️
            </div>
            <p className="mt-2 font-semibold">{term ? "Ningún proyecto coincide con la búsqueda" : "Aún no hay proyectos"}</p>
            <p className="mt-1 text-sm text-[#5d6b77]">
              {term ? "Prueba con otro nombre." : "Crea el primero para llevar su cubicación, etapas y Gantt."}
            </p>
            {canCreate && !term && (
              <Link
                href="/proyectos/nuevo"
                className="mt-4 inline-block rounded-lg bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]"
              >
                + Nuevo proyecto
              </Link>
            )}
          </div>
        )}

        {[...byClient.values()].map(({ client, items }) => (
          <section key={client.id}>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: client.color || "#08a89f" }} />
              <h2 className="text-sm font-semibold">{client.name}</h2>
              <span className="rounded bg-[#eceff1] px-1.5 text-xs text-[#5d6b77]">{items.length}</span>
              {canCreate && (
                <Link
                  href={`/proyectos/nuevo?cliente=${client.id}`}
                  className="ml-auto text-xs font-semibold text-[#08a89f] hover:underline"
                >
                  + Proyecto
                </Link>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map(({ p, consumed, done, b, badge }) => (
                <Link
                  key={p.id}
                  href={projectHref(p, p.client)}
                  className="group rounded-2xl border border-[#e4e8ec] bg-white p-4 transition hover:border-[#0bdbcf] hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 font-semibold leading-snug group-hover:text-[#08a89f]">{p.name}</div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[#5d6b77]">
                    {p.startDate && p.endDate ? `${shortDate(p.startDate)} → ${shortDate(p.endDate)}` : "Sin fechas definidas"}
                    {b.lateDays > 0 && (
                      <span className="ml-2 font-semibold text-[#d21f3c]">{b.lateDays} d de atraso</span>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-[#5d6b77]">
                      <span>Tareas</span>
                      <span>
                        {done} de {p.requests.length}
                      </span>
                    </div>
                    <Bar pct={p.requests.length ? (done / p.requests.length) * 100 : 0} color="#0bdbcf" />
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-[#5d6b77]">
                      <span>Horas</span>
                      {b.hasHours ? (
                        <span>
                          {hoursLabel(consumed)} de {hoursLabel(p.estimatedHours!)}
                          {b.redHours > 0 && (
                            <span className="ml-1 font-semibold text-[#d21f3c]">(+{hoursLabel(b.redHours)})</span>
                          )}
                        </span>
                      ) : (
                        <span>{hoursLabel(consumed)} · sin cubicación</span>
                      )}
                    </div>
                    {b.hasHours && (
                      <Bar pct={b.pctUsed} color={b.redHours > 0 ? "#d21f3c" : b.pctUsed >= 80 ? "#c97416" : "#0e9f6e"} />
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-[#f1f3f4] pt-2 text-[11px] text-[#7f7f7f]">
                    <span>
                      {p._count.stages} etapa{p._count.stages === 1 ? "" : "s"}
                    </span>
                    <span className="font-semibold text-[#08a89f] opacity-0 transition group-hover:opacity-100">Abrir →</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
