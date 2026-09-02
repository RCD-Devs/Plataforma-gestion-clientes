import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requestVisibilityWhere } from "@/lib/authz";
import { Filters } from "@/components/Filters";
import { Avatar, StatusBadge, PriorityTag, ClientTag } from "@/components/ui";
import { hoursLabel, relative } from "@/lib/format";
import { getUnreadRequestIds } from "@/lib/commentReads";
import { getStatuses } from "@/lib/statuses";

export const dynamic = "force-dynamic";

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const sp = await searchParams;

  const where: Prisma.RequestWhereInput = { ...requestVisibilityWhere(user) };
  where.archivedAt = sp.archivadas === "1" ? { not: null } : null;
  if (sp.cliente) where.clientId = sp.cliente;
  if (sp.proyecto) where.projectId = sp.proyecto;
  if (sp.responsable) where.assigneeId = sp.responsable;
  if (sp.equipo) where.teamId = sp.equipo;
  if (sp.estado) where.status = sp.estado;
  if (sp.prioridad) where.priority = sp.prioridad;
  if (sp.rol) where.assignee = { role: sp.rol };
  // Rec. #79/#80 — insensible a mayúsculas (mode: "insensitive", Postgres
  // ILIKE) y extendido a cliente y comentarios, no solo título/folio/
  // descripción. Insensible a acentos queda pendiente aparte: requiere la
  // extensión unaccent de Postgres + SQL crudo, que no compone con el
  // resto de este `where` armado por partes — ver Pendientes técnicos.
  if (sp.q)
    where.OR = [
      { title: { contains: sp.q, mode: "insensitive" } },
      { key: { contains: sp.q, mode: "insensitive" } },
      { description: { contains: sp.q, mode: "insensitive" } },
      { client: { name: { contains: sp.q, mode: "insensitive" } } },
      { client: { code: { contains: sp.q, mode: "insensitive" } } },
      { comments: { some: { body: { contains: sp.q, mode: "insensitive" } } } },
    ];
  if (sp.desde || sp.hasta) {
    const range: Prisma.DateTimeFilter = {};
    if (sp.desde) range.gte = new Date(sp.desde);
    if (sp.hasta) {
      const d = new Date(sp.hasta);
      d.setHours(23, 59, 59, 999);
      range.lte = d;
    }
    where.createdAt = range;
  }

  const [requests, clients, users, teams, projects, statuses] = await Promise.all([
    prisma.request.findMany({
      where,
      include: {
        client: true,
        assignee: true,
        timeEntries: { select: { hours: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { role: { not: "CLIENTE" } },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    getStatuses(),
  ]);

  const unreadIds =
    user.role === "CLIENTE"
      ? new Set<string>()
      : await getUnreadRequestIds(user.id, requests.map((r) => r.id));

  const totalHours = requests.reduce(
    (a, r) => a + r.timeEntries.reduce((x, t) => x + t.hours, 0),
    0,
  );

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e6e8eb] bg-white px-6 py-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#6b7280]">Espacio · Mantención</div>
            <h1 className="font-brand text-base font-semibold">Solicitudes</h1>
          </div>
          <Link
            href="/solicitar"
            target="_blank"
            className="rounded-lg bg-[#0bdbcf] px-3 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]"
          >
            + Nueva solicitud
          </Link>
        </div>
        <Filters clients={clients} users={users} teams={teams} projects={projects} statuses={statuses} />
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-3 text-sm text-[#6b7280]">
          {requests.length} solicitudes · {hoursLabel(totalHours)} cargadas
        </div>
        <div className="overflow-hidden rounded-xl border border-[#e6e8eb] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e6e8eb] text-left text-xs text-[#6b7280]">
                <th className="px-4 py-2.5 font-medium">Solicitud</th>
                <th className="px-4 py-2.5 font-medium">Responsable</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 font-medium">Prioridad</th>
                <th className="px-4 py-2.5 font-medium">Horas</th>
                <th className="px-4 py-2.5 font-medium">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const hrs = r.timeEntries.reduce((a, t) => a + t.hours, 0);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#f9fafb]"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/solicitudes/${r.key}`} className="block">
                        <div className="flex items-center gap-1.5">
                          <ClientTag name={r.client.code || r.client.name} />
                          <span className="text-xs text-[#9ca3af]">{r.key}</span>
                          {unreadIds.has(r.id) && (
                            <span
                              title="El cliente respondió y nadie lo ha visto"
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#d21f3c]"
                            />
                          )}
                        </div>
                        <div className="mt-0.5 font-medium">{r.title}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {r.assignee ? (
                        <span className="inline-flex items-center gap-2">
                          <Avatar
                            name={r.assignee.name}
                            color={r.assignee.color}
                            size={22}
                          />
                          {r.assignee.name}
                        </span>
                      ) : (
                        <span className="text-[#9ca3af]">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      <PriorityTag priority={r.priority} />
                    </td>
                    <td className="px-4 py-3">
                      {hrs > 0 ? hoursLabel(hrs) : "—"}
                    </td>
                    <td className="px-4 py-3 text-[#6b7280]">
                      {relative(r.updatedAt)}
                    </td>
                  </tr>
                );
              })}
              {requests.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-[#9ca3af]"
                  >
                    No hay solicitudes con esos filtros.
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
