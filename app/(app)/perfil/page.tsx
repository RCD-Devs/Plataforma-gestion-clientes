import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasAccess, clientScopeWhere } from "@/lib/permissions";
import { getStatuses, getStatusMap } from "@/lib/statuses";
import { weekRange, addDays } from "@/lib/scheduleBlocks";
import { toDateInput, mondayOf } from "@/lib/dates";
import { Avatar } from "@/components/ui";
import { PersonalCalendar } from "@/components/PersonalCalendar";

export const dynamic = "force-dynamic";

export default async function PerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "CLIENTE") redirect("/portal");

  const { week } = await searchParams;
  const { start, end } = weekRange(week);
  const weekStart = toDateInput(start);
  // addDays (por componentes de fecha, no ms) para no desfasarse un día en
  // el cambio de hora — mismo criterio que projectBudget.ts.
  const prevWeek = mondayOf(addDays(start, -7));
  const nextWeek = mondayOf(addDays(start, 7));
  const isCurrentWeek = weekStart === mondayOf(new Date());

  const finalCodes = new Set((await getStatuses()).filter((s) => s.isFinal).map((s) => s.code));
  const statusMap = await getStatusMap();

  const clientWhere = hasAccess(user.capabilities, "clients.view")
    ? clientScopeWhere(user.capabilities, "clients.view", user.id)
    : { OR: [{ accountManagerId: user.id }, { members: { some: { userId: user.id } } }] };

  const [blocks, myTasks, clients] = await Promise.all([
    prisma.scheduleBlock.findMany({
      where: { userId: user.id, start: { gte: start, lte: end } },
      include: { request: { select: { key: true, title: true, status: true } } },
      orderBy: { start: "asc" },
    }),
    prisma.request.findMany({
      where: {
        archivedAt: null,
        OR: [{ assigneeId: user.id }, { collaborators: { some: { userId: user.id } } }],
      },
      select: { id: true, key: true, title: true, status: true, client: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.client.findMany({
      where: { isActive: true, ...clientWhere },
      orderBy: { name: "asc" },
      select: { id: true, name: true, projects: { where: { archivedAt: null }, select: { id: true, name: true } } },
    }),
  ]);

  const calendarBlocks = blocks.map((b) => ({
    id: b.id,
    start: b.start.toISOString(),
    end: b.end.toISOString(),
    note: b.note,
    confirmed: !!b.timeEntryId,
    request: { key: b.request.key, title: b.request.title, status: b.request.status, color: statusMap[b.request.status]?.color ?? "#08a89f" },
  }));
  const openTasks = myTasks.filter((t) => !finalCodes.has(t.status));

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e8ec] bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} color={user.color} size={40} />
          <div>
            <h1 className="font-brand text-base font-semibold">{user.name}</h1>
            <p className="text-xs text-[#5d6b77]">
              {user.roleNames.length > 0 ? user.roleNames.join(" · ") : "Sin rol asignado"}
            </p>
          </div>
        </div>
      </header>

      <div className="border-b border-[#e4e8ec] bg-white px-6">
        <div role="tablist" className="flex gap-4 text-sm">
          <span className="border-b-2 border-[#0bdbcf] py-2.5 font-semibold text-[#081826]">Calendario</span>
          <span className="cursor-not-allowed py-2.5 text-[#c3cbd1]" title="Próximamente: métricas y alertas personales">
            Resumen · próximamente
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/perfil?week=${prevWeek}`} className="rounded-lg border border-[#e4e8ec] px-2.5 py-1.5 hover:bg-[#f4f6f8]">
              ← Semana anterior
            </Link>
            {!isCurrentWeek && (
              <Link href="/perfil" className="rounded-lg border border-[#e4e8ec] px-2.5 py-1.5 hover:bg-[#f4f6f8]">
                Hoy
              </Link>
            )}
            <Link href={`/perfil?week=${nextWeek}`} className="rounded-lg border border-[#e4e8ec] px-2.5 py-1.5 hover:bg-[#f4f6f8]">
              Semana siguiente →
            </Link>
          </div>
          <span className="text-xs text-[#5d6b77]">
            {start.toLocaleDateString("es-CL", { day: "2-digit", month: "short" })} –{" "}
            {end.toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
          </span>
        </div>

        <PersonalCalendar
          key={weekStart}
          weekStart={weekStart}
          blocks={calendarBlocks}
          tasks={openTasks.map((t) => ({ id: t.id, key: t.key, title: t.title, clientName: t.client.name }))}
          clients={clients}
        />
      </div>
    </div>
  );
}
