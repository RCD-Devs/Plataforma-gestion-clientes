import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isTeamRole, dailyAccess } from "@/lib/authz";
import { chileDateKey } from "@/lib/dates";
import { dueLabel } from "@/lib/followUps";
import { isoWeekday, monthBounds, timeForDay } from "@/lib/dailyRotation";
import { holidayYearsCovered } from "@/lib/holidaysCL";
import { Avatar, avatarSrc } from "@/components/ui";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { SeguimientosTabs } from "@/components/SeguimientosTabs";
import { DailySeriesForm } from "@/components/DailySeriesForm";
import { setDailyCancelled, setDailyFacilitator, setDailyTime } from "@/app/actions";
import { Popover } from "@/components/Popover";

export const dynamic = "force-dynamic";

const WEEKDAY = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const WEEKDAY_LONG = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const monthFmt = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" });

function shiftMonth(month: string, d: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
}

// Dailys por equipo (etapa 2): quién lidera cada fecha del mes. Admin ve y
// gestiona todos los equipos; Director/Líder, los suyos (propio + a
// cargo); el resto ve solo su equipo, sin editar (lib/authz dailyAccess).
export default async function DailysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isTeamRole(user.role)) redirect("/portal");
  const sp = await searchParams;
  const access = dailyAccess(user);
  const todayKey = chileDateKey(new Date());
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : todayKey.slice(0, 7);

  const [teams, people] = await Promise.all([
    prisma.team.findMany({
      where: access.all ? {} : { id: { in: access.view } },
      include: { daily: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { not: "CLIENTE" }, isActive: true },
      select: { id: true, name: true, teamId: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (teams.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <SeguimientosTabs active="dailys" />
        <p className="p-10 text-center text-sm text-[#7f7f7f]">
          {access.all
            ? "No hay equipos creados. Se crean en Administración → Equipos."
            : "No tienes un equipo asignado. Pídele a un Admin que te agregue a uno en Administración → Equipos."}
        </p>
      </div>
    );
  }
  const team =
    teams.find((t) => t.id === sp.equipo) ?? teams.find((t) => t.id === user.teamId) ?? teams.find((t) => t.daily) ?? teams[0];
  const series = team.daily;
  const canManage = access.all || access.manage.includes(team.id);
  const href = (patch: { equipo?: string; mes?: string }) => {
    const q = new URLSearchParams({ equipo: patch.equipo ?? team.id, mes: patch.mes ?? month });
    return `/seguimientos/dailys?${q}`;
  };

  const { first, last } = monthBounds(month);
  const person = { select: { id: true, name: true, color: true, avatarUpdatedAt: true } } as const;
  const [meetings, upcoming] = series
    ? await Promise.all([
        prisma.meeting.findMany({
          where: { seriesId: series.id, dayKey: { gte: first, lte: last } },
          include: { facilitator: person, _count: { select: { followUps: true } } },
          orderBy: { dayKey: "asc" },
        }),
        prisma.meeting.findMany({
          where: { seriesId: series.id, dayKey: { gte: todayKey }, cancelledAt: null },
          include: { facilitator: person },
          orderBy: { dayKey: "asc" },
          take: 4,
        }),
      ])
    : [[], []];
  const next = upcoming[0];
  const rotation = new Set(series?.memberIds ?? []);
  // Hora de una fecha: la suya (puede venir cambiada a mano) o la del día en la serie.
  const timeOf = (m: { time: string | null; dayKey: string | null }) =>
    m.time ?? (series ? timeForDay(series.dayTimes, series.time, isoWeekday(m.dayKey!)) : "");
  const missingHolidays = !holidayYearsCovered().has(month.slice(0, 4));

  const facilitatorPicker = (meetingId: string, current: string | null) => (
    <form action={setDailyFacilitator}>
      <input type="hidden" name="id" value={meetingId} />
      <AutoSubmitSelect name="facilitatorId" defaultValue={current ?? ""} aria-label="Quién lidera">
        {!current && <option value="">Elegir…</option>}
        <optgroup label="En la rotación">
          {people.filter((p) => rotation.has(p.id)).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </optgroup>
        <optgroup label="Otras personas">
          {people.filter((p) => !rotation.has(p.id)).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </optgroup>
      </AutoSubmitSelect>
    </form>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e4e8ec] bg-white px-6 py-3">
        <h1 className="font-brand text-base font-semibold">Seguimientos</h1>
        <p className="text-xs text-[#5d6b77]">Quién lidera la daily de cada equipo. Los acuerdos se anotan como seguimientos.</p>
      </header>
      <SeguimientosTabs active="dailys" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
          {/* Equipos */}
          <nav aria-label="Equipo" className={`flex flex-wrap gap-2 ${teams.length === 1 ? "hidden" : ""}`}>
            {teams.map((t) => {
              const on = t.id === team.id;
              return (
                <Link
                  key={t.id}
                  href={href({ equipo: t.id })}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    on ? "border-[#081826] bg-[#081826] text-white" : "border-[#e4e8ec] bg-white text-[#5d6b77] hover:border-[#c3ccd4]"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: t.color || "#9ca3af" }} />
                  {t.name}
                  {!t.daily && <span className={on ? "text-white/60" : "text-[#9aa3ad]"}>· sin daily</span>}
                </Link>
              );
            })}
          </nav>

          {!series ? (
            <section className="rounded-2xl border border-[#e4e8ec] bg-white p-5">
              <h2 className="text-sm font-semibold text-[#081826]">{team.name} todavía no tiene daily</h2>
              {canManage ? (
                <>
                  <p className="mb-5 mt-1 text-xs text-[#5d6b77]">
                    Elige los días, la hora y el orden de quién la lidera. Se planifica sola hasta fin del mes siguiente.
                  </p>
                  <DailySeriesForm
                    teamId={team.id}
                    initial={null}
                    people={people.map((p) => ({ id: p.id, name: p.name, inTeam: p.teamId === team.id }))}
                  />
                </>
              ) : (
                <p className="mt-1 text-xs text-[#5d6b77]">La configura un Admin, Director o Líder de área.</p>
              )}
            </section>
          ) : (
            <>
              {/* Próxima daily */}
              <section className="flex flex-wrap items-center gap-5 rounded-2xl border border-[#d9e6ec] bg-[#eef5f8] p-5">
                {next ? (
                  <>
                    {next.facilitator ? (
                      <Avatar name={next.facilitator.name} color={next.facilitator.color} photo={avatarSrc(next.facilitator)} size={48} />
                    ) : (
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-lg text-[#9aa3ad]">?</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#08766f]">Próxima daily</div>
                      <div className="text-lg font-semibold text-[#081826] first-letter:uppercase">
                        {dueLabel(next.dayKey!, todayKey)} · {timeOf(next)}
                      </div>
                      <div className="text-sm text-[#3b4552]">
                        {next.facilitator ? (
                          <>
                            Lidera <span className="font-semibold">{next.facilitator.id === user.id ? "tú" : next.facilitator.name}</span>
                          </>
                        ) : (
                          "Sin persona asignada"
                        )}
                      </div>
                    </div>
                    {upcoming.length > 1 && (
                      <div className="text-xs text-[#5d6b77]">
                        <div className="mb-1 font-semibold uppercase tracking-wide text-[#7f7f7f]">Después</div>
                        {upcoming.slice(1).map((m) => (
                          <div key={m.id}>
                            <span className="text-[#9aa3ad]">{WEEKDAY[isoWeekday(m.dayKey!)]} {Number(m.dayKey!.slice(8))}</span>{" "}
                            {m.facilitator?.name ?? "—"}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[#5d6b77]">No hay próximas dailys planificadas. Revisa los días y la rotación en la configuración.</p>
                )}
              </section>

              {/* Mes */}
              <section>
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold capitalize text-[#081826]">{monthFmt.format(new Date(`${month}-15T12:00:00Z`))}</h2>
                  <div className="flex items-center gap-1">
                    <Link href={href({ mes: shiftMonth(month, -1) })} aria-label="Mes anterior" className="grid h-8 w-8 place-items-center rounded-lg text-[#5d6b77] hover:bg-[#eef1f4]">
                      ‹
                    </Link>
                    {month !== todayKey.slice(0, 7) && (
                      <Link href={href({ mes: todayKey.slice(0, 7) })} className="rounded-lg px-2 py-1 text-xs font-semibold text-[#5d6b77] hover:bg-[#eef1f4]">
                        Hoy
                      </Link>
                    )}
                    <Link href={href({ mes: shiftMonth(month, 1) })} aria-label="Mes siguiente" className="grid h-8 w-8 place-items-center rounded-lg text-[#5d6b77] hover:bg-[#eef1f4]">
                      ›
                    </Link>
                  </div>
                </div>
                {missingHolidays && (
                  <p className="mb-2 rounded-lg bg-[#fdf1e3] px-3 py-2 text-xs text-[#9a5a25]">
                    Todavía no está cargado el calendario de feriados de {month.slice(0, 4)}: los feriados de ese año no se cancelan solos.
                  </p>
                )}
                {meetings.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[#d5dbe0] bg-white px-4 py-8 text-center text-xs text-[#7f7f7f]">
                    {month > todayKey.slice(0, 7) ? "Este mes todavía no se planifica: se hace solo cuando se acerca." : "Sin dailys este mes."}
                  </p>
                ) : (
                  <ul className="divide-y divide-[#f1f3f4] rounded-xl border border-[#e4e8ec] bg-white">
                    {meetings.map((m) => {
                      const key = m.dayKey!;
                      const past = key < todayKey;
                      const isToday = key === todayKey;
                      const cancelled = !!m.cancelledAt;
                      return (
                        <li key={m.id} className={`flex flex-wrap items-center gap-4 px-4 py-2.5 ${past ? "opacity-55" : ""} ${isToday ? "bg-[#f0fdfc]" : ""}`}>
                          <div
                            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-center leading-none ${
                              isToday ? "bg-[#0bdbcf] text-[#081826]" : "bg-[#f4f6f8] text-[#3b4552]"
                            }`}
                          >
                            <span className="text-[10px] font-semibold uppercase">{WEEKDAY[isoWeekday(key)]}</span>
                            <span className="text-base font-semibold">{Number(key.slice(8))}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            {cancelled ? (
                              <div className="text-sm text-[#7f7f7f]">
                                <span className="line-through">Daily {timeOf(m)}</span>
                                <span className="ml-2 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-semibold text-[#5d6b77]">
                                  {m.cancelReason ?? "Cancelada"}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-sm">
                                {m.facilitator && <Avatar name={m.facilitator.name} color={m.facilitator.color} photo={avatarSrc(m.facilitator)} size={22} />}
                                <span className="font-medium text-[#081826]">
                                  {m.facilitator ? (m.facilitator.id === user.id ? "Tú" : m.facilitator.name) : "Sin asignar"}
                                </span>
                                <span className="text-xs tabular-nums text-[#9aa3ad]">
                                  {timeOf(m)}
                                  {m.manualAt && " · cambiada a mano"}
                                </span>
                              </div>
                            )}
                            {m._count.followUps > 0 && (
                              <Link href="/seguimientos" className="text-xs font-semibold text-[#08a89f] hover:underline">
                                {m._count.followUps} acuerdo{m._count.followUps === 1 ? "" : "s"}
                              </Link>
                            )}
                          </div>
                          {canManage && !past && (
                            <div className="flex items-center gap-2">
                              {!cancelled && facilitatorPicker(m.id, m.facilitatorId)}
                              {!cancelled && (
                                <Popover
                                  ariaLabel="Cambiar la hora de esta daily"
                                  trigger={<span className="text-xs font-semibold tabular-nums text-[#5d6b77]">{timeOf(m)}</span>}
                                  panelClassName="w-56"
                                >
                                  <form action={setDailyTime} className="flex items-center gap-2 p-3">
                                    <input type="hidden" name="id" value={m.id} />
                                    <input
                                      type="time"
                                      name="time"
                                      required
                                      defaultValue={timeOf(m)}
                                      aria-label="Hora"
                                      className="min-w-0 flex-1 rounded-md border border-[#e4e8ec] px-2 py-1.5 text-sm"
                                    />
                                    <button className="rounded-md bg-[#081826] px-3 py-1.5 text-xs font-semibold text-white">Guardar</button>
                                  </form>
                                  <p className="px-3 pb-3 text-[11px] text-[#7f7f7f]">Solo para esta fecha.</p>
                                </Popover>
                              )}
                              <form action={setDailyCancelled}>
                                <input type="hidden" name="id" value={m.id} />
                                <input type="hidden" name="cancel" value={cancelled ? "0" : "1"} />
                                <button
                                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                                    cancelled ? "text-[#08a89f] hover:bg-[#e0fbf9]" : "text-[#a01830] hover:bg-[#fdeef0]"
                                  }`}
                                >
                                  {cancelled ? "Restaurar" : "Cancelar"}
                                </button>
                              </form>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {canManage && (
                <details className="group/cfg rounded-2xl border border-[#e4e8ec] bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
                    <span>
                      <span className="block text-sm font-semibold text-[#081826]">Configuración de la daily</span>
                      <span className="text-xs text-[#5d6b77]">
                        {series.weekdays.map((d) => `${WEEKDAY_LONG[d]} ${timeForDay(series.dayTimes, series.time, d)}`).join(" · ") || "sin días"} ·{" "}
                        {series.memberIds.length} en la rotación
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-xs text-[#5d6b77] transition group-open/cfg:rotate-180">▼</span>
                  </summary>
                  <div className="border-t border-[#f1f3f4] p-5">
                    <DailySeriesForm
                      teamId={team.id}
                      initial={{
                        weekdays: series.weekdays,
                        times: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, timeForDay(series.dayTimes, series.time, d)])),
                        memberIds: series.memberIds,
                      }}
                      people={people.map((p) => ({ id: p.id, name: p.name, inTeam: p.teamId === team.id }))}
                    />
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
