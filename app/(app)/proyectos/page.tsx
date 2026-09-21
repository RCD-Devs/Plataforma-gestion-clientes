import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasAccess, clientScopeWhere } from "@/lib/permissions";
import { getStatuses } from "@/lib/statuses";
import { budgetStatus } from "@/lib/projectBudget";
import { Bar } from "@/components/ui";
import { hoursLabel, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProyectosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasAccess(user.capabilities, "projects.view")) redirect("/mi-espacio");

  const [projects, statuses] = await Promise.all([
    prisma.project.findMany({
      where: {
        archivedAt: null,
        client: clientScopeWhere(user.capabilities, "projects.view", user.id),
      },
      include: {
        client: { select: { name: true } },
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

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e4e8ec] bg-white px-6 py-3">
        <h1 className="font-brand text-base font-semibold">Proyectos</h1>
        <p className="text-xs text-[#5d6b77]">
          Cubicación estimada vs. consumo real, por proyecto o sitio
        </p>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="overflow-x-auto rounded-xl border border-[#e4e8ec] bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[#e4e8ec] text-left text-xs text-[#5d6b77]">
                <th className="px-4 py-2.5 font-semibold">Proyecto</th>
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 font-semibold">Fechas</th>
                <th className="px-4 py-2.5 font-semibold">Horas</th>
                <th className="px-4 py-2.5 font-semibold">Tareas</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const consumed = p.requests.reduce(
                  (a, r) => a + r.timeEntries.reduce((x, t) => x + t.hours, 0),
                  0,
                );
                const done = p.requests.filter((r) => finalCodes.has(r.status)).length;
                const b = budgetStatus({
                  estimatedHours: p.estimatedHours,
                  consumedHours: consumed,
                  startDate: p.startDate,
                  endDate: p.endDate,
                  done: p.requests.length > 0 && done === p.requests.length,
                });
                return (
                  <tr key={p.id} className="border-b border-[#f1f3f4] align-top last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/proyectos/${p.id}`} className="font-semibold hover:text-[#08a89f] hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#5d6b77]">{p.client.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#5d6b77]">
                      {p.startDate && p.endDate ? `${shortDate(p.startDate)} → ${shortDate(p.endDate)}` : "—"}
                      {b.lateDays > 0 && (
                        <div className="text-xs font-semibold text-[#d21f3c]">{b.lateDays} d de atraso</div>
                      )}
                    </td>
                    <td className="w-56 px-4 py-3">
                      {b.hasHours ? (
                        <>
                          <div className="mb-1 flex justify-between text-xs">
                            <span>
                              {hoursLabel(consumed)} de {hoursLabel(p.estimatedHours!)}
                            </span>
                            {b.redHours > 0 && (
                              <span className="font-semibold text-[#d21f3c]">+{hoursLabel(b.redHours)} en rojo</span>
                            )}
                          </div>
                          <Bar pct={b.pctUsed} color={b.redHours > 0 ? "#d21f3c" : b.pctUsed >= 80 ? "#c97416" : "#0e9f6e"} />
                        </>
                      ) : (
                        <span className="text-[#7f7f7f]">{hoursLabel(consumed)} · sin cubicación</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#5d6b77]">
                      {done} de {p.requests.length}
                    </td>
                  </tr>
                );
              })}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#7f7f7f]">
                    No hay proyectos. Se crean desde Administración → Clientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
