import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasAccess, clientScopeWhere, type Capabilities } from "@/lib/permissions";
import { getStatuses, getStatusMap } from "@/lib/statuses";
import { parseLocalDate, toDateInput, chileDateKey } from "@/lib/dates";
import { avatarSrc, Avatar } from "@/components/ui";
import { AvatarUpload } from "@/components/AvatarUpload";
import { PersonalCalendar, DayHours } from "@/components/PersonalCalendar";
import { SubmitButton } from "@/components/SubmitButton";
import { disconnectGoogleCalendar, updateWorkHours } from "@/app/actions";
import { fetchGoogleEvents, googleConfigured, type GoogleFetchResult } from "@/lib/googleCalendar";
import {
  calendarDays,
  expectedHours,
  extraHours,
  parseWorkHours,
  shiftKey,
  shiftMonth,
  WEEKDAY_LABELS,
  type CalendarView,
} from "@/lib/workSchedule";
import { PersonalSummary } from "@/components/PersonalSummary";
import { loadPersonalDashboard } from "@/lib/personalDashboard";

export const dynamic = "force-dynamic";

const tabCls = (active: boolean) =>
  `border-b-2 py-2.5 text-sm font-semibold ${active ? "border-[#0bdbcf] text-[#081826]" : "border-transparent text-[#7f7f7f] hover:text-[#081826]"}`;

export default async function PerfilPage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    date?: string;
    view?: string;
    tab?: string;
    google?: string;
  }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "CLIENTE") redirect("/portal");

  const { week, date, view, tab, google } = await searchParams;
  // `week` = enlaces viejos (?week=YYYY-MM-DD).
  const calDate = date ?? week ?? "";
  const activeTab = tab === "calendario" ? "calendario" : "resumen";

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e8ec] bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} color={user.color} photo={avatarSrc(user)} size={56} />
          <div>
            <h1 className="font-brand text-base font-semibold">{user.name}</h1>
            <p className="text-xs text-[#5d6b77]">
              {user.roleNames.length > 0 ? user.roleNames.join(" · ") : "Sin rol asignado"}
            </p>
            <AvatarUpload hasPhoto={Boolean(user.avatarUpdatedAt)} />
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
          <CalendarTab
            userId={user.id}
            capabilities={user.capabilities}
            view={view === "dia" || view === "mes" ? view : "semana"}
            date={/^\d{4}-\d{2}-\d{2}$/.test(calDate) ? calDate : toDateInput(new Date())}
            googleResult={google}
          />
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
  view,
  date,
  googleResult,
}: {
  userId: string;
  capabilities: Capabilities;
  view: CalendarView;
  date: string;
  googleResult?: string;
}) {
  const days = calendarDays(view, date);
  const start = parseLocalDate(days[0]);
  start.setHours(0, 0, 0, 0);
  const end = parseLocalDate(shiftKey(days[days.length - 1], 1));
  end.setHours(0, 0, 0, 0);
  end.setMilliseconds(-1);

  const step = (dir: 1 | -1) =>
    view === "mes" ? shiftMonth(date, dir) : shiftKey(date, dir * (view === "dia" ? 1 : 7));
  const href = (v: CalendarView, d: string) => `/perfil?tab=calendario&view=${v}&date=${d}`;
  const rangeLabel =
    view === "mes"
      ? parseLocalDate(date).toLocaleDateString("es-CL", {
          month: "long",
          year: "numeric",
        })
      : view === "dia"
        ? parseLocalDate(date).toLocaleDateString("es-CL", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })
        : `${start.toLocaleDateString("es-CL", { day: "2-digit", month: "short" })} – ${end.toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}`;

  const finalCodes = new Set((await getStatuses()).filter((s) => s.isFinal).map((s) => s.code));
  const statusMap = await getStatusMap();

  const clientWhere = hasAccess(capabilities, "clients.view")
    ? clientScopeWhere(capabilities, "clients.view", userId)
    : { OR: [{ accountManagerId: userId }, { members: { some: { userId } } }] };

  const [blocks, myTasks, clients, entries, me, googleLink] = await Promise.all([
    prisma.scheduleBlock.findMany({
      where: {
        userId,
        start: { gte: start, lte: end },
        request: { deletedAt: null },
      },
      include: {
        request: { select: { key: true, title: true, status: true } },
      },
      orderBy: { start: "asc" },
    }),
    prisma.request.findMany({
      where: {
        archivedAt: null,
        OR: [{ assigneeId: userId }, { collaborators: { some: { userId } } }],
      },
      select: {
        id: true,
        key: true,
        title: true,
        status: true,
        client: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.client.findMany({
      where: { isActive: true, ...clientWhere },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        projects: {
          where: { archivedAt: null },
          select: { id: true, name: true },
        },
      },
    }),
    // ±1 día de margen: se agrupa por día en hora de Chile, no del servidor.
    prisma.timeEntry.findMany({
      where: {
        userId,
        date: { gte: shiftDate(start, -1), lte: shiftDate(end, 1) },
      },
      select: { hours: true, date: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { workHours: true },
    }),
    prisma.googleCalendarLink.findUnique({ where: { userId } }),
  ]);

  // Reuniones de Google del rango visible (no en la vista mes, que es solo
  // un resumen). Se consultan en vivo en cada carga: no se guardan en REVO.
  const google: GoogleFetchResult | null =
    googleLink && view !== "mes" ? await fetchGoogleEvents(googleLink.refreshToken, start, end) : null;
  let googleEvents = google?.status === "ok" ? google.events : [];
  if (googleEvents.length > 0) {
    // Las ya cargadas (aunque el bloque se haya movido a otro día) no se
    // vuelven a ofrecer.
    const imported = await prisma.scheduleBlock.findMany({
      where: { userId, googleEventId: { in: googleEvents.map((e) => e.id) } },
      select: { googleEventId: true },
    });
    const done = new Set(imported.map((b) => b.googleEventId));
    googleEvents = googleEvents.filter((e) => !done.has(e.id));
  }

  const workHours = parseWorkHours(me?.workHours);
  const hoursByDay: Record<string, number> = {};
  for (const e of entries) {
    const k = chileDateKey(e.date);
    hoursByDay[k] = (hoursByDay[k] ?? 0) + e.hours;
  }

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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href={href(view, step(-1))} aria-label="Anterior" className={navCls}>
            ←
          </Link>
          <Link href={href(view, toDateInput(new Date()))} className={navCls}>
            Hoy
          </Link>
          <Link href={href(view, step(1))} aria-label="Siguiente" className={navCls}>
            →
          </Link>
          <span className="ml-1 font-semibold capitalize text-[#081826]">{rangeLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" className="inline-flex gap-1 rounded-lg border border-[#e4e8ec] bg-white p-1">
            {VIEWS.map(([v, label]) => (
              <Link
                key={v}
                href={href(v, date)}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${v === view ? "bg-[#081826] text-white" : "text-[#5d6b77] hover:text-[#081826]"}`}
              >
                {label}
              </Link>
            ))}
          </div>
          <WorkHoursForm workHours={workHours} />
          {googleConfigured() && <GoogleCalendarControl email={googleLink?.googleEmail ?? null} />}
        </div>
      </div>

      <GoogleNotice result={googleResult} fetch={google} />

      {view === "mes" ? (
        <MonthGrid
          days={days}
          month={date.slice(0, 7)}
          blocks={calendarBlocks}
          hoursByDay={hoursByDay}
          workHours={workHours}
          dayHref={(d) => href("dia", d)}
        />
      ) : (
        <PersonalCalendar
          key={`${view}-${days[0]}`}
          days={days}
          hoursByDay={hoursByDay}
          workHours={workHours}
          blocks={calendarBlocks}
          googleEvents={googleEvents}
          tasks={openTasks.map((t) => ({
            id: t.id,
            key: t.key,
            title: t.title,
            clientName: t.client.name,
          }))}
          clients={clients}
        />
      )}
    </>
  );
}

const navCls = "rounded-lg border border-[#e4e8ec] px-2.5 py-1.5 hover:bg-[#f4f6f8]";
const VIEWS = [
  ["dia", "Día"],
  ["semana", "Semana"],
  ["mes", "Mes"],
] as const;

function shiftDate(d: Date, days: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

// Vista mensual: solo lectura — horas del día y sus bloques; clic en un
// día abre la vista Día, donde se crean/mueven bloques.
function MonthGrid({
  days,
  month,
  blocks,
  hoursByDay,
  workHours,
  dayHref,
}: {
  days: string[];
  month: string; // "YYYY-MM"
  blocks: {
    id: string;
    start: string;
    request: { key: string; title: string; color: string };
  }[];
  hoursByDay: Record<string, number>;
  workHours: number[];
  dayHref: (d: string) => string;
}) {
  const today = toDateInput(new Date());
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e4e8ec] bg-white">
      <div className="grid min-w-[700px] grid-cols-7">
        {WEEKDAY_LABELS.map((l) => (
          <div key={l} className="border-b border-[#f1f3f4] py-2 text-center text-xs font-semibold text-[#5d6b77]">
            {l}
          </div>
        ))}
        {days.map((d) => {
          const dayBlocks = blocks.filter((b) => chileDateKey(new Date(b.start)) === d);
          const registered = hoursByDay[d] ?? 0;
          const expected = expectedHours(workHours, d);
          return (
            <Link
              key={d}
              href={dayHref(d)}
              className={`flex min-h-28 flex-col gap-1 border-b border-r border-[#f1f3f4] p-1.5 hover:bg-[#f9fafb] ${d.startsWith(month) ? "" : "opacity-40"}`}
            >
              <div className="flex items-start justify-between gap-1">
                <span
                  className={`text-xs ${d === today ? "rounded-full bg-[#0bdbcf] px-1.5 font-semibold text-[#081826]" : "text-[#5d6b77]"}`}
                >
                  {Number(d.slice(8))}
                </span>
                <span className="text-right">
                  <DayHours registered={registered} expected={expected} extra={extraHours(registered, expected)} />
                </span>
              </div>
              {dayBlocks.slice(0, 3).map((b) => (
                <span
                  key={b.id}
                  title={b.request.title}
                  className="truncate rounded px-1 text-[10px] font-semibold text-white"
                  style={{ background: b.request.color }}
                >
                  {b.request.key}
                </span>
              ))}
              {dayBlocks.length > 3 && <span className="text-[10px] text-[#7f7f7f]">+{dayBlocks.length - 3} más</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Jornada laboral propia: horas netas (sin colación) por día de la semana.
function WorkHoursForm({ workHours }: { workHours: number[] }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-lg border border-[#e4e8ec] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#5d6b77] hover:text-[#081826]">
        Mi jornada
      </summary>
      <form
        action={updateWorkHours}
        className="absolute right-0 z-20 mt-1 w-72 space-y-3 rounded-xl border border-[#e4e8ec] bg-white p-4 shadow-lg"
      >
        <p className="text-xs text-[#5d6b77]">
          Horas netas por día (descontada la colación). Se comparan con las horas registradas para calcular las horas
          extra.
        </p>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((l, i) => (
            <label key={l} className="text-center text-[10px] font-semibold text-[#5d6b77]">
              {l}
              <input
                name={`h${i}`}
                type="number"
                step="0.25"
                min="0"
                max="24"
                defaultValue={workHours[i]}
                className="mt-1 w-full rounded border border-[#e4e8ec] px-0.5 py-1 text-center text-xs outline-none focus:border-[#0bdbcf]"
              />
            </label>
          ))}
        </div>
        <SubmitButton className="w-full rounded-md bg-[#0bdbcf] py-1.5 text-xs font-semibold text-[#081826] hover:bg-[#09c4ba]">
          Guardar jornada
        </SubmitButton>
      </form>
    </details>
  );
}

// Vincular / desvincular el Google Calendar propio (solo lectura).
function GoogleCalendarControl({ email }: { email: string | null }) {
  if (!email)
    return (
      <a
        href="/api/google/connect"
        className="rounded-lg border border-[#e4e8ec] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#5d6b77] hover:text-[#081826]"
      >
        Vincular Google Calendar
      </a>
    );
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-lg border border-[#e4e8ec] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#5d6b77] hover:text-[#081826]">
        Google Calendar ✓
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-72 space-y-3 rounded-xl border border-[#e4e8ec] bg-white p-4 shadow-lg">
        <p className="text-xs text-[#5d6b77]">
          Vinculado con <span className="font-semibold text-[#081826]">{email}</span>. Tus reuniones aparecen con borde
          punteado: haz clic en una para cargarla como horas a una tarea. REVO solo lee tu calendario, nunca lo modifica.
        </p>
        <div className="flex gap-2">
          <a
            href="/api/google/connect"
            className="flex-1 rounded-md border border-[#e4e8ec] py-1.5 text-center text-xs font-semibold text-[#5d6b77] hover:text-[#081826]"
          >
            Cambiar cuenta
          </a>
          <form action={disconnectGoogleCalendar} className="flex-1">
            <SubmitButton className="w-full rounded-md border border-[#f1c3c9] py-1.5 text-xs font-semibold text-[#d21f3c] hover:bg-[#fdeef0]">
              Desvincular
            </SubmitButton>
          </form>
        </div>
      </div>
    </details>
  );
}

// Resultado de la vinculación (?google=… al volver de Google) o problema
// al leer las reuniones en esta carga.
function GoogleNotice({ result, fetch }: { result?: string; fetch: GoogleFetchResult | null }) {
  const notice =
    fetch?.status === "reconnect"
      ? { ok: false, text: "Google Calendar dejó de dar acceso. Vuelve a vincularlo para ver tus reuniones." }
      : fetch?.status === "error"
        ? { ok: false, text: "No se pudieron cargar tus reuniones de Google en este momento. Intenta recargar." }
        : result === "ok"
          ? { ok: true, text: "Google Calendar vinculado. Tus reuniones aparecen con borde punteado." }
          : result === "error"
            ? { ok: false, text: "No se pudo vincular Google Calendar. Intenta de nuevo." }
            : result === "no-config"
              ? { ok: false, text: "La integración con Google Calendar aún no está configurada." }
              : null;
  if (!notice) return null;
  return (
    <div
      className={`mb-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${notice.ok ? "border-[#9fe3c6] bg-[#e3f6ee] text-[#0a7a52]" : "border-[#fda565] bg-[#fdf1e3] text-[#9a5a25]"}`}
    >
      <span>{notice.text}</span>
      {fetch?.status === "reconnect" && (
        <a href="/api/google/connect" className="shrink-0 text-xs font-semibold hover:underline">
          Vincular de nuevo
        </a>
      )}
    </div>
  );
}
