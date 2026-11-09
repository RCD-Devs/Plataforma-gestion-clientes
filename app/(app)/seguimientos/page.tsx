import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isTeamRole, workClientsWhere, followUpVisibilityWhere, canManageFollowUp, canManageDailyTeam } from "@/lib/authz";
import { hasAccess } from "@/lib/permissions";
import { chileDateKey, DAY } from "@/lib/dates";
import { addDaysKey, daysToNextMonday, dueLabel, followUpBucket, type FollowUpBucket } from "@/lib/followUps";
import { alertDueFollowUps } from "@/lib/followUpAlerts";
import { longDate, relative } from "@/lib/format";
import { Avatar, avatarSrc, ClientTag } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { Popover } from "@/components/Popover";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { FollowUpForm, type FollowUpInitial, type MeetingOption } from "@/components/FollowUpForm";
import { EditFollowUpButton } from "@/components/EditFollowUpButton";
import { SeguimientosTabs } from "@/components/SeguimientosTabs";
import { deleteFollowUp, postponeFollowUp, renameMeeting, setFollowUpDone } from "@/app/actions";

export const dynamic = "force-dynamic";

const DONE_LIMIT = 50;
const MEETINGS_DAYS = 21; // reuniones que se ofrecen al anotar

type Filter = FollowUpBucket | "done";
const FILTERS: Filter[] = ["late", "today", "upcoming", "done"];

const TONE: Record<FollowUpBucket, { title: string; head: string; dot: string; chip: string }> = {
  late: { title: "Vencidos", head: "text-[#a01830]", dot: "bg-[#d21f3c]", chip: "bg-[#fdeef0] text-[#a01830]" },
  today: { title: "Hoy", head: "text-[#9a4a1e]", dot: "bg-[#fb693b]", chip: "bg-[#feede6] text-[#9a4a1e]" },
  upcoming: { title: "Próximos", head: "text-[#5d6b77]", dot: "bg-[#c3ccd4]", chip: "bg-[#f3f4f6] text-[#4b5563]" },
};

const menuItem = "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#f4f6f8]";
const meetingDayFmt = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Santiago" });
const meetingShortFmt = new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Santiago" });

function CheckIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Seguimientos (dailys, etapa 1): checklist con fecha, responsable y
// participantes, agrupable por la reunión donde se anotó.
export default async function SeguimientosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isTeamRole(user.role)) redirect("/portal");
  const sp = await searchParams;
  const viewAll = hasAccess(user.capabilities, "followups.view_all");
  // Responsable (solo quien ve todo): "" = todos, "yo" = donde estoy involucrado.
  const resp = viewAll ? (sp.responsable ?? "") : "";
  const byDate = sp.vista === "fecha";
  const filter = FILTERS.includes(sp.ver as Filter) ? (sp.ver as Filter) : null;
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const next = { responsable: resp || null, vista: byDate ? "fecha" : null, ver: filter, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const qs = q.toString();
    return qs ? `/seguimientos?${qs}` : "/seguimientos";
  };

  await alertDueFollowUps().catch(() => {});

  const visible = followUpVisibilityWhere(user);
  const where: Prisma.FollowUpWhereInput = {
    AND: [
      visible,
      resp === "yo"
        ? { OR: [{ ownerId: user.id }, { assigneeId: user.id }, { participants: { some: { userId: user.id } } }] }
        : resp
          ? { assigneeId: resp }
          : {},
    ],
  };
  const person = { select: { id: true, name: true, color: true, avatarUpdatedAt: true } } as const;
  const include = {
    client: { select: { name: true, code: true } },
    request: { select: { id: true, key: true, title: true, deletedAt: true, client: { select: { name: true } } } },
    extraRequests: { select: { id: true, key: true, title: true, deletedAt: true, client: { select: { name: true } } } },
    waitingOn: { select: { name: true } },
    owner: person,
    assignee: person,
    doneBy: { select: { id: true, name: true } },
    participants: { select: { user: person } },
    meeting: {
      select: {
        id: true,
        title: true,
        date: true,
        createdById: true,
        seriesId: true,
        createdBy: { select: { name: true } },
        facilitator: { select: { id: true, name: true } },
        series: { select: { time: true, teamId: true, team: { select: { name: true } } } },
      },
    },
  } as const;
  const todayKey = chileDateKey(new Date());
  const [open, done, doneThisWeek, clients, people, recentMeetings] = await Promise.all([
    prisma.followUp.findMany({
      where: { AND: [where, { doneAt: null }] },
      include,
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.followUp.findMany({
      where: { AND: [where, { doneAt: { not: null } }] },
      include,
      orderBy: { doneAt: "desc" },
      take: DONE_LIMIT,
    }),
    prisma.followUp.count({ where: { AND: [where, { doneAt: { gte: new Date(Date.now() - 7 * DAY) } }] } }),
    prisma.client.findMany({
      where: { AND: [workClientsWhere(user), { isActive: true }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { not: "CLIENTE" }, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.meeting.findMany({
      where: {
        date: { gte: new Date(Date.now() - MEETINGS_DAYS * DAY) },
        OR: [
          { createdById: user.id, seriesId: null },
          { followUps: { some: visible } },
          // Dailys de mi equipo hasta hoy (las futuras planificadas no se ofrecen).
          ...(user.teamId ? [{ series: { teamId: user.teamId }, dayKey: { lte: todayKey }, cancelledAt: null }] : []),
        ],
      },
      select: {
        id: true,
        title: true,
        date: true,
        createdById: true,
        seriesId: true,
        dayKey: true,
        time: true,
        facilitator: { select: { id: true, name: true } },
        series: { select: { time: true, team: { select: { name: true } } } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
  ]);

  const meetingTitle = (m: { title: string | null; series?: { team: { name: string } } | null }) =>
    m.title || (m.series ? `Daily ${m.series.team.name}` : "Reunión");
  const meetings: MeetingOption[] = recentMeetings.map((m) => ({
    id: m.id,
    label: `${meetingTitle(m)} · ${meetingShortFmt.format(m.date)}`,
  }));
  // Si hoy ya abrí una reunión, lo nuevo cae ahí por defecto.
  // Daily de hoy de mi equipo (si hay): banner + reunión por defecto al
  // anotar; si no, la reunión que yo abrí hoy.
  const todayDaily = recentMeetings.find((m) => m.seriesId && m.dayKey === todayKey);
  const defaultMeetingId =
    todayDaily?.id ??
    recentMeetings.find((m) => !m.seriesId && m.createdById === user.id && chileDateKey(m.date) === todayKey)?.id ??
    "";

  const rows = open.map((f) => {
    const dueKey = chileDateKey(f.dueDate);
    return { f, dueKey, bucket: followUpBucket(dueKey, todayKey) };
  });
  const count = (b: FollowUpBucket) => rows.filter((r) => r.bucket === b).length;
  const shown = filter === "done" ? [] : filter ? rows.filter((r) => r.bucket === filter) : rows;

  type Item = (typeof open)[number];
  type Row = (typeof rows)[number];
  const formProps = { todayKey, meId: user.id, people, clients, meetings };
  const initialOf = (f: Item): FollowUpInitial => ({
    id: f.id,
    text: f.text,
    dueKey: chileDateKey(f.dueDate),
    assigneeId: f.assignee.id,
    participantIds: f.participants.map((p) => p.user.id),
    waitingOnId: f.waitingOnId,
    clientId: f.clientId,
    meetingId: f.meetingId,
    requests: linkedTasks(f).map((r) => ({ id: r.id, key: r.key, title: r.title, clientName: r.client.name })),
  });

  const linkedTasks = (f: Item) => [f.request, ...f.extraRequests].filter((r) => r && !r.deletedAt).map((r) => r!);

  const meta = (f: Item, showMeeting: boolean) => {
    const others = f.participants.map((p) => p.user);
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7f7f7f]">
        <span className="inline-flex items-center gap-1.5 font-medium text-[#3b4552]">
          <span className="flex -space-x-1.5">
            {[f.assignee, ...others].slice(0, 4).map((u) => (
              <span key={u.id} className="rounded-full ring-2 ring-white">
                <Avatar name={u.name} color={u.color} photo={avatarSrc(u)} size={18} />
              </span>
            ))}
          </span>
          {f.assignee.id === user.id ? "Tú" : f.assignee.name}
          {others.length > 0 && <span className="font-normal text-[#7f7f7f]">+ {others.length === 1 ? others[0].name : `${others.length} personas`}</span>}
        </span>
        {linkedTasks(f).map((r) => (
          <Link key={r.id} href={`/solicitudes/${r.key}`} className="inline-flex max-w-[20rem] items-center gap-1.5 hover:text-[#08a89f]">
            <span className="rounded bg-[#e0fbf9] px-1.5 py-0.5 text-[11px] font-semibold text-[#08766f]">{r.key}</span>
            <span className="truncate">{r.title}</span>
          </Link>
        ))}
        {f.client && linkedTasks(f).length === 0 && <ClientTag name={f.client.code || f.client.name} />}
        {f.waitingOn && (
          <span className="inline-flex items-center gap-1">
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
              <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Esperando a {f.waitingOn.name}
          </span>
        )}
        {showMeeting && f.meeting && (
          <span className="rounded bg-[#eef1f4] px-1.5 py-0.5 text-[11px] font-medium text-[#3b4552]">
            {meetingTitle(f.meeting)} · {meetingShortFmt.format(f.meeting.date)}
          </span>
        )}
        {f.owner.id !== f.assignee.id && <span>Anotado por {f.owner.id === user.id ? "ti" : f.owner.name}</span>}
      </div>
    );
  };

  const hidden = (f: Item) => <input type="hidden" name="id" value={f.id} />;

  // "⋯": posponer (si está abierto) y eliminar (si lo puede gestionar).
  const menu = (f: Item, isDone: boolean, canManage: boolean) =>
    (!isDone || canManage) && (
      <Popover
        ariaLabel="Más acciones"
        trigger={<span className="px-0.5 text-base leading-none text-[#5d6b77]">⋯</span>}
        triggerClassName="border-transparent px-1.5! py-0.5!"
        panelClassName="w-60"
      >
        {!isDone && (
          <>
            <div className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#9aa3ad]">Posponer para</div>
            {(
              [
                ["Mañana", 1],
                ["Próximo lunes", daysToNextMonday(todayKey)],
                ["En una semana", 7],
              ] as const
            ).map(([label, days]) => (
              <form key={label} action={postponeFollowUp}>
                {hidden(f)}
                <input type="hidden" name="days" value={days} />
                <button className={menuItem}>
                  {label}
                  <span className="text-xs text-[#9aa3ad] first-letter:uppercase">{dueLabel(addDaysKey(todayKey, days), todayKey)}</span>
                </button>
              </form>
            ))}
            <form action={postponeFollowUp} className="flex items-center gap-2 px-3 py-2">
              {hidden(f)}
              <input type="date" name="date" required min={todayKey} aria-label="Otra fecha" className="min-w-0 flex-1 rounded-md border border-[#e4e8ec] px-2 py-1 text-xs" />
              <button className="rounded-md bg-[#081826] px-2.5 py-1 text-xs font-semibold text-white">Mover</button>
            </form>
          </>
        )}
        {canManage && (
          <form action={deleteFollowUp} className={isDone ? "" : "border-t border-[#f1f3f4]"}>
            {hidden(f)}
            <button className={`${menuItem} text-[#a01830] hover:bg-[#fdeef0]`}>Eliminar seguimiento</button>
          </form>
        )}
      </Popover>
    );

  const openRow = ({ f, dueKey, bucket }: Row, showMeeting: boolean) => {
    const canManage = canManageFollowUp(user, f);
    return (
      <li
        key={f.id}
        className={`group flex items-start gap-3 px-4 py-3.5 transition first:rounded-t-xl last:rounded-b-xl hover:bg-[#fafbfc] ${
          bucket === "late" ? "shadow-[inset_3px_0_0_#d21f3c]" : ""
        }`}
      >
        {f.owner.id === user.id ? (
          <form action={setFollowUpDone} className="pt-0.5">
            {hidden(f)}
            <input type="hidden" name="done" value="1" />
            <SubmitButton
              pendingLabel={<CheckIcon />}
              className="grid h-5 w-5 place-items-center rounded-full border-2 border-[#c3ccd4] text-transparent transition hover:border-[#08a89f] hover:bg-[#e0fbf9] hover:text-[#08a89f] disabled:opacity-100! disabled:border-[#08a89f] disabled:bg-[#08a89f] disabled:text-white"
            >
              <span className="sr-only">Marcar como resuelto</span>
              <CheckIcon />
            </SubmitButton>
          </form>
        ) : (
          // Solo quien lo anotó lo resuelve: los demás ven el círculo inactivo.
          <span
            title={`Solo ${f.owner.name} puede marcarlo como resuelto`}
            className="mt-0.5 block h-5 w-5 shrink-0 cursor-help rounded-full border-2 border-dashed border-[#d5dbe0]"
          >
            <span className="sr-only">Solo {f.owner.name} puede marcarlo como resuelto</span>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-line text-sm font-medium leading-snug text-[#081826]">{f.text}</p>
          {meta(f, showMeeting)}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex items-center gap-0.5 transition sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100">
            {canManage && <EditFollowUpButton {...formProps} initial={initialOf(f)} />}
            {menu(f, false, canManage)}
          </div>
          <span
            title={longDate(f.dueDate)}
            className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold first-letter:uppercase ${TONE[bucket].chip}`}
          >
            {dueLabel(dueKey, todayKey)}
          </span>
        </div>
      </li>
    );
  };

  const list = (items: Row[], showMeeting: boolean) => (
    <ul className="divide-y divide-[#f1f3f4] rounded-xl border border-[#e4e8ec] bg-white">{items.map((r) => openRow(r, showMeeting))}</ul>
  );

  // Por reunión: una cápsula por reunión (la más reciente arriba) y al
  // final los sueltos.
  const groups = new Map<string, { meeting: NonNullable<Item["meeting"]>; items: Row[] }>();
  const loose: Row[] = [];
  for (const r of shown) {
    if (!r.f.meeting) loose.push(r);
    else (groups.get(r.f.meeting.id) ?? groups.set(r.f.meeting.id, { meeting: r.f.meeting, items: [] }).get(r.f.meeting.id)!).items.push(r);
  }
  const capsules = [...groups.values()].sort((a, b) => b.meeting.date.getTime() - a.meeting.date.getTime());

  const stats: { key: Filter; label: string; n: number; cls: string; ring: string }[] = [
    { key: "late", label: "Vencidos", n: count("late"), cls: "text-[#a01830]", ring: "border-[#d21f3c] ring-[#d21f3c]/15" },
    { key: "today", label: "Para hoy", n: count("today"), cls: "text-[#c2541f]", ring: "border-[#fb693b] ring-[#fb693b]/15" },
    { key: "upcoming", label: "Próximos", n: count("upcoming"), cls: "text-[#081826]", ring: "border-[#081826] ring-[#081826]/10" },
    { key: "done", label: "Resueltos esta semana", n: doneThisWeek, cls: "text-[#08a89f]", ring: "border-[#08a89f] ring-[#08a89f]/15" },
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e8ec] bg-white px-6 py-3">
        <div>
          <h1 className="font-brand text-base font-semibold">Seguimientos</h1>
          <p className="text-xs text-[#5d6b77]">{viewAll ? "Los de todo el equipo" : "Los que anotaste y en los que participas"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {viewAll && (
            <form className="flex items-center gap-2 text-xs text-[#5d6b77]">
              {byDate && <input type="hidden" name="vista" value="fecha" />}
              {filter && <input type="hidden" name="ver" value={filter} />}
              <label htmlFor="responsable">Responsable</label>
              <AutoSubmitSelect id="responsable" name="responsable" defaultValue={resp}>
                <option value="">Todo el equipo</option>
                <option value="yo">Donde participo</option>
                {people
                  .filter((p) => p.id !== user.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </AutoSubmitSelect>
            </form>
          )}
          <nav aria-label="Agrupar" className="flex items-center gap-1 rounded-lg border border-[#e4e8ec] p-1">
            {[
              { label: "Por reunión", on: !byDate, to: href({ vista: null }) },
              { label: "Por fecha", on: byDate, to: href({ vista: "fecha" }) },
            ].map((t) => (
              <Link
                key={t.label}
                href={t.to}
                aria-current={t.on ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${t.on ? "bg-[#081826] text-white" : "text-[#5d6b77] hover:text-[#081826]"}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <SeguimientosTabs active="seguimientos" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
          {todayDaily && (
            <Link
              href="/seguimientos/dailys"
              className="flex items-center gap-3 rounded-xl border border-[#0bdbcf]/40 bg-[#f0fdfc] px-4 py-3 text-sm transition hover:border-[#0bdbcf]"
            >
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-[#0bdbcf] text-xs font-bold text-[#081826]">
                HOY
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-[#081826]">
                  {meetingTitle(todayDaily)} · {todayDaily.time ?? todayDaily.series?.time}
                </span>
                <span className="text-[#3b4552]">
                  {" "}
                  — lidera {todayDaily.facilitator ? (todayDaily.facilitator.id === user.id ? "tú" : todayDaily.facilitator.name) : "nadie asignado"}
                </span>
                <span className="block text-xs text-[#5d6b77]">Lo que anotes abajo queda como acuerdo de esta daily.</span>
              </span>
              <span className="text-xs font-semibold text-[#08a89f]">Ver planificación →</span>
            </Link>
          )}

          <FollowUpForm mode="create" {...formProps} defaultMeetingId={defaultMeetingId} />

          {/* Filtros: clic muestra solo ese grupo; clic de nuevo, todo. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => {
              const on = filter === s.key;
              return (
                <Link
                  key={s.key}
                  href={href({ ver: on ? null : s.key })}
                  aria-pressed={on}
                  className={`rounded-xl border bg-white px-4 py-3 transition ${
                    on ? `${s.ring} ring-4` : "border-[#e4e8ec] hover:border-[#c3ccd4]"
                  }`}
                >
                  <div className={`text-2xl font-semibold tabular-nums ${s.n ? s.cls : "text-[#c3ccd4]"}`}>{s.n}</div>
                  <div className="flex items-center justify-between text-xs text-[#5d6b77]">
                    {s.label}
                    {on && <span className="text-[11px] font-semibold text-[#081826]">Quitar filtro ✕</span>}
                  </div>
                </Link>
              );
            })}
          </div>

          {filter !== "done" &&
            (byDate ? (
              (["late", "today", "upcoming"] as const).map((bucket) => {
                const items = shown.filter((r) => r.bucket === bucket);
                if (items.length === 0) return null;
                const t = TONE[bucket];
                return (
                  <section key={bucket}>
                    <h2 className={`mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide ${t.head}`}>
                      <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                      {t.title}
                      <span className="font-normal text-[#9aa3ad]">{items.length}</span>
                    </h2>
                    {list(items, true)}
                  </section>
                );
              })
            ) : (
              <>
                {capsules.map(({ meeting: m, items }) => {
                  // Daily automática: su "autor" es quien encabeza la rotación; renombrarla es de quien gestiona.
                  const canRename = m.series
                    ? canManageDailyTeam(user, m.series.teamId)
                    : canManageFollowUp(user, { ownerId: m.createdById });
                  return (
                    <section key={m.id} className="rounded-2xl border border-[#d9e6ec] bg-[#eef5f8] p-2">
                      <div className="flex items-center gap-3 px-2 pb-2.5 pt-1.5">
                        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#08a89f] shadow-sm">
                          <svg viewBox="0 0 16 16" className="h-4 w-4">
                            <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </span>
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-sm font-semibold text-[#081826]">{meetingTitle(m)}</h2>
                          <p className="text-xs text-[#5d6b77] first-letter:uppercase">
                            {meetingDayFmt.format(m.date)} · {items.length} abierto{items.length === 1 ? "" : "s"}
                            {m.seriesId
                              ? m.facilitator && ` · lideró ${m.facilitator.id === user.id ? "tú" : m.facilitator.name}`
                              : m.createdById !== user.id && ` · creada por ${m.createdBy.name}`}
                          </p>
                        </div>
                        {canRename && (
                          <Popover
                            ariaLabel="Renombrar reunión"
                            trigger={<span className="text-xs font-semibold text-[#5d6b77]">Renombrar</span>}
                            triggerClassName="border-transparent"
                            panelClassName="w-72"
                          >
                            <form action={renameMeeting} className="flex gap-2 p-3">
                              <input type="hidden" name="id" value={m.id} />
                              <input
                                name="title"
                                defaultValue={m.title ?? ""}
                                maxLength={120}
                                placeholder="Ej: Daily"
                                aria-label="Nombre de la reunión"
                                className="min-w-0 flex-1 rounded-md border border-[#e4e8ec] px-2 py-1.5 text-sm"
                              />
                              <button className="rounded-md bg-[#081826] px-3 py-1.5 text-xs font-semibold text-white">Guardar</button>
                            </form>
                          </Popover>
                        )}
                      </div>
                      {list(items, false)}
                    </section>
                  );
                })}
                {loose.length > 0 && (
                  <section>
                    {capsules.length > 0 && (
                      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[#5d6b77]">
                        Sin reunión <span className="font-normal text-[#9aa3ad]">{loose.length}</span>
                      </h2>
                    )}
                    {list(loose, false)}
                  </section>
                )}
              </>
            ))}

          {filter !== "done" && shown.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#d5dbe0] bg-white px-6 py-12 text-center">
              <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-[#e0fbf9] text-[#08a89f]">
                <CheckIcon className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-[#081826]">{filter ? "Nada por aquí" : "Todo al día"}</p>
              <p className="mt-1 text-xs text-[#5d6b77]">
                {filter ? (
                  <Link href={href({ ver: null })} className="font-semibold text-[#08a89f] hover:underline">
                    Ver todos los seguimientos
                  </Link>
                ) : (
                  "Anota lo que salga de la daily y avisamos a los involucrados el día que toque."
                )}
              </p>
            </div>
          )}

          {done.length > 0 && (!filter || filter === "done") && (
            <details open={filter === "done"} className="group/done">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-[#5d6b77] hover:text-[#081826]">
                <span aria-hidden="true" className="inline-block text-[9px] transition group-open/done:rotate-90">▶</span>
                Resueltos (historial)
                <span className="font-normal text-[#9aa3ad]">
                  {done.length}
                  {done.length === DONE_LIMIT ? "+" : ""}
                </span>
              </summary>
              <ul className="mt-2 divide-y divide-[#f1f3f4] rounded-xl border border-[#e4e8ec] bg-white">
                {done.map((f) => (
                  <li key={f.id} className="group flex items-start gap-3 px-4 py-3 first:rounded-t-xl last:rounded-b-xl hover:bg-[#fafbfc]">
                    {f.owner.id === user.id ? (
                      <form action={setFollowUpDone} className="pt-0.5">
                        {hidden(f)}
                        <input type="hidden" name="done" value="0" />
                        <SubmitButton
                          pendingLabel={<CheckIcon />}
                          className="grid h-5 w-5 place-items-center rounded-full border-2 border-[#08a89f] bg-[#08a89f] text-white transition hover:border-[#c3ccd4] hover:bg-white hover:text-[#c3ccd4]"
                        >
                          <span className="sr-only">Reabrir</span>
                          <CheckIcon />
                        </SubmitButton>
                      </form>
                    ) : (
                      <span title="Resuelto" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#08a89f] text-white">
                        <CheckIcon />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-line text-sm text-[#5d6b77]">{f.text}</p>
                      {meta(f, true)}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <div className="transition sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100">
                        {menu(f, true, canManageFollowUp(user, f))}
                      </div>
                      <span title={longDate(f.doneAt)} className="whitespace-nowrap text-[11px] text-[#9aa3ad]">
                        Resuelto{f.doneAuto ? " automáticamente (tareas completadas)" : f.doneBy && f.doneBy.id !== user.id ? ` por ${f.doneBy.name}` : ""} {relative(f.doneAt!)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
