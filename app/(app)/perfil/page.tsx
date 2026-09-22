import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasAccess, clientScopeWhere, type Capabilities } from "@/lib/permissions";
import { getStatuses, getStatusMap } from "@/lib/statuses";
import { weekRange, addDays } from "@/lib/scheduleBlocks";
import { toDateInput, mondayOf } from "@/lib/dates";
import { Avatar } from "@/components/ui";
import { PersonalCalendar } from "@/components/PersonalCalendar";
import { PersonalSummary } from "@/components/PersonalSummary";
import { loadPersonalDashboard } from "@/lib/personalDashboard";

export const dynamic = "force-dynamic";

const tabCls = (active: boolean) =>
  `border-b-2 py-2.5 text-sm font-semibold ${active ? "border-[#0bdbcf] text-[#081826]" : "border-transparent text-[#7f7f7f] hover:text-[#081826]"}`;

export default async function PerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; tab?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "CLIENTE") redirect("/portal");

  const { week, tab } = await searchParams;
  const activeTab = tab === "calendario" ? "calendario" : "resumen";

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
        <div role="tablist" className="flex gap-4">
          <Link href="/perfil?tab=resumen" className={tabCls(activeTab === "resumen")}>
            Resumen
          </Link>
          <Link href="/perfil?tab=calendario" className={tabCls(activeTab === "calendario")}>
            Calendario
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "calendario" ? (
          <CalendarTab userId={user.id} capabilities={user.capabilities} week={week} />
        ) : (
          <PersonalSummary data={await loadPersonalDashboard(user.id)} />
        )}
      </div>
    </div>
  );
}

async function CalendarTab({
  userId,
  capabilities,
  week,
}: {
  userId: string;
  capabilities: Capabilities;
  week?: string;
}) {
  const { start, end } = weekRange(week);
  const weekStart = toDateInput(start);
  // addDays (por componentes de fecha, no ms) para no desfasarse un día en
  // el cambio de hora — mismo criterio que projectBudget.ts.
  const prevWeek = mondayOf(addDays(start, -7));
  const nextWeek = mondayOf(addDays(start, 7));
  const isCurrentWeek = weekStart === mondayOf(new Date());

  const finalCodes = new Set((await getStatuses()).filter((s) => s.isFinal).map((s) => s.code));
  const statusMap = await getStatusMap();

  const clientWhere = hasAccess(capabilities, "clients.view")
    ? clientScopeWhere(capabilities, "clients.view", userId)
    : { OR: [{ accountManagerId: userId }, { members: { some: { userId } } }] };

  const [blocks, myTasks, clients] = await Promise.all([
    prisma.scheduleBlock.findMany({
      where: { userId, start: { gte: start, lte: end } },
      include: { request: { select: { key: true, title: true, status: true } } },
      orderBy: { start: "asc" },
    }),
    prisma.request.findMany({
      where: {
        archivedAt: null,
        OR: [{ assigneeId: userId }, { collaborators: { some: { userId } } }],
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
    request: {
      key: b.request.key,
      title: b.request.title,
      status: b.request.status,
      color: statusMap[b.request.status]?.color ?? "#08a89f",
    },
  }));
  const openTasks = myTasks.filter((t) => !finalCodes.has(t.status));

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/perfil?tab=calendario&week=${prevWeek}`} className="rounded-lg border border-[#e4e8ec] px-2.5 py-1.5 hover:bg-[#f4f6f8]">
            ← Semana anterior
          </Link>
          {!isCurrentWeek && (
            <Link href="/perfil?tab=calendario" className="rounded-lg border border-[#e4e8ec] px-2.5 py-1.5 hover:bg-[#f4f6f8]">
              Hoy
            </Link>
          )}
          <Link href={`/perfil?tab=calendario&week=${nextWeek}`} className="rounded-lg border border-[#e4e8ec] px-2.5 py-1.5 hover:bg-[#f4f6f8]">
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
    </>
  );
}
