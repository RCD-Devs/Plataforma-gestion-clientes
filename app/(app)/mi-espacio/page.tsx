import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getStatuses } from "@/lib/statuses";
import { StatusSelect } from "@/components/controls";
import { PriorityTag, ClientTag } from "@/components/ui";
import { HandoffPanel } from "@/components/Handoff";
import { markTeamAlertsRead } from "@/app/actions";
import { hoursLabel, relative, shortDate } from "@/lib/format";
import { daysFromToday } from "@/lib/dates";
import { getUnreadRequestIds } from "@/lib/commentReads";
import { getPendingNudge } from "@/lib/nudges";
import { NudgeBanner } from "@/components/NudgeBanner";
import { escalateSlaAlerts } from "@/lib/slaAlerts";

export const dynamic = "force-dynamic";

function dueInfo(dueDate: Date | null, isFinal: boolean) {
  if (!dueDate || isFinal) return null;
  const days = daysFromToday(dueDate);
  if (days < 0)
    return { tone: "late" as const, text: `Vencida hace ${-days} día${days === -1 ? "" : "s"}` };
  if (days === 0) return { tone: "today" as const, text: "Vence hoy" };
  if (days <= 3)
    return { tone: "soon" as const, text: `Vence en ${days} día${days === 1 ? "" : "s"}` };
  return null;
}

const toneCls = {
  late: "border-[#f7c3c9] bg-[#fdeef0] text-[#a01830]",
  today: "border-[#fb693b] bg-[#feede6] text-[#9a4a1e]",
  soon: "border-[#fda565] bg-[#fdf1e3] text-[#9a5a25]",
};

export default async function MiEspacioPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { vista } = await searchParams;
  const asList = vista === "lista";

  // Antes del Promise.all (no en paralelo): si la solicitud vencida es de
  // este mismo usuario, así la notificación recién creada ya aparece en
  // "alerts" más abajo, sin esperar a la siguiente carga de página.
  await escalateSlaAlerts().catch(() => {});

  const [tasks, teammates, alerts, unread, statuses, nudgeItems] = await Promise.all([
    prisma.request.findMany({
      where: {
        archivedAt: null,
        OR: [{ assigneeId: user.id }, { collaborators: { some: { userId: user.id } } }],
      },
      include: {
        client: true,
        attachments: { select: { id: true } },
        comments: { select: { id: true } },
        timeEntries: { select: { hours: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.user.findMany({
      where: { role: { not: "CLIENTE" }, id: { not: user.id } },
      orderBy: { name: "asc" },
    }),
    prisma.notification.findMany({
      where: { recipientEmail: user.email, channel: "team" },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.notification.count({
      where: { recipientEmail: user.email, channel: "team", read: false },
    }),
    getStatuses(),
    getPendingNudge(user.id),
  ]);
  const finalCodes = new Set(statuses.filter((s) => s.isFinal).map((s) => s.code));

  const unreadIds = await getUnreadRequestIds(user.id, tasks.map((t) => t.id));

  const reminders = tasks
    .map((t) => ({ t, due: dueInfo(t.dueDate, finalCodes.has(t.status)) }))
    .filter((x) => x.due)
    .sort((a, b) => (a.t.dueDate!.getTime() ?? 0) - (b.t.dueDate!.getTime() ?? 0));

  const open = tasks.filter((t) => !finalCodes.has(t.status)).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e8ec] bg-white px-6 py-3">
        <div>
          <h1 className="font-brand text-base font-semibold">Mi espacio</h1>
          <p className="text-xs text-[#5d6b77]">
            {user.name} · {open} tareas abiertas
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[#e4e8ec] p-1">
          <Link
            href="/mi-espacio"
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              !asList ? "bg-[#081826] text-white" : "text-[#5d6b77]"
            }`}
          >
            ▦ Tablero
          </Link>
          <Link
            href="/mi-espacio?vista=lista"
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              asList ? "bg-[#081826] text-white" : "text-[#5d6b77]"
            }`}
          >
            ☰ Lista
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {nudgeItems && <NudgeBanner items={nudgeItems} />}
        {(reminders.length > 0 || alerts.length > 0) && (
          <div className="grid gap-4 border-b border-[#e4e8ec] bg-white/60 px-6 py-4 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#5d6b77]">
                ⏰ Recordatorios de entrega
              </h2>
              <div className="space-y-1.5">
                {reminders.slice(0, 5).map(({ t, due }) => (
                  <Link
                    key={t.id}
                    href={`/solicitudes/${t.key}`}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${toneCls[due!.tone]}`}
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-semibold">{t.key}</span> · {t.title}
                    </span>
                    <span className="shrink-0 text-xs font-semibold">
                      {due!.text}
                    </span>
                  </Link>
                ))}
                {reminders.length === 0 && (
                  <div className="text-sm text-[#7f7f7f]">
                    Sin entregas próximas. 👌
                  </div>
                )}
              </div>
            </section>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[#5d6b77]">
                  🔔 Notificaciones{" "}
                  {unread > 0 && (
                    <span className="ml-1 rounded-full bg-[#fb693b] px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {unread} nuevas
                    </span>
                  )}
                </h2>
                {unread > 0 && (
                  <form action={markTeamAlertsRead}>
                    <button className="text-xs text-[#08a89f] hover:underline">
                      Marcar leídas
                    </button>
                  </form>
                )}
              </div>
              <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {alerts.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      n.read
                        ? "border-[#e4e8ec] bg-white text-[#5d6b77]"
                        : "border-[#0bdbcf] bg-[#e0fbf9] text-[#06413d]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">
                        {n.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-[#7f7f7f]">
                        {relative(n.createdAt)}
                      </span>
                    </div>
                    <div className="truncate text-xs">{n.body}</div>
                  </div>
                ))}
                {alerts.length === 0 && (
                  <div className="text-sm text-[#7f7f7f]">
                    Sin notificaciones aún.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {asList ? (
          <div className="p-6">
            <div className="overflow-x-auto rounded-xl border border-[#e4e8ec] bg-white">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-[#e4e8ec] text-left text-xs text-[#5d6b77]">
                    <th className="px-4 py-2.5 font-semibold">Tarea</th>
                    <th className="px-4 py-2.5 font-semibold">Cliente</th>
                    <th className="px-4 py-2.5 font-semibold">Prioridad</th>
                    <th className="px-4 py-2.5 font-semibold">Entrega</th>
                    <th className="px-4 py-2.5 font-semibold">Estado</th>
                    <th className="px-4 py-2.5 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => {
                    const due = dueInfo(t.dueDate, finalCodes.has(t.status));
                    const hrs = t.timeEntries.reduce((a, e) => a + e.hours, 0);
                    return (
                      <tr
                        key={t.id}
                        className="border-b border-[#f1f3f4] align-top last:border-0"
                      >
                        <td className="px-4 py-3">
                          <Link href={`/solicitudes/${t.key}`}>
                            <div className="flex items-center gap-1.5 text-xs text-[#7f7f7f]">
                              {t.key} · {t.type}
                              {unreadIds.has(t.id) && (
                                <span
                                  title="El cliente respondió y nadie lo ha visto"
                                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#d21f3c]"
                                />
                              )}
                            </div>
                            <div className="font-semibold">{t.title}</div>
                            <div className="mt-0.5 line-clamp-1 max-w-md text-xs text-[#5d6b77]">
                              {t.description}
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-[11px] text-[#7f7f7f]">
                              <span>📎 {t.attachments.length}</span>
                              <span>💬 {t.comments.length}</span>
                              {hrs > 0 && <span>◷ {hoursLabel(hrs)}</span>}
                              {t.clientPriority && (
                                <span>★ {t.clientPriority}/5 cliente</span>
                              )}
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{t.client.name}</div>
                          <div className="text-xs text-[#7f7f7f]">
                            {t.requesterEmail || "—"}
                          </div>
                          <div className="text-xs text-[#7f7f7f]">
                            Ingreso {shortDate(t.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <PriorityTag priority={t.priority} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {shortDate(t.dueDate)}
                          {due && (
                            <div
                              className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${toneCls[due.tone]}`}
                            >
                              {due.text}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusSelect requestId={t.id} value={t.status} statuses={statuses} />
                        </td>
                        <td className="px-4 py-3">
                          <HandoffPanel
                            requestId={t.id}
                            teammates={teammates.map((m) => ({
                              id: m.id,
                              name: m.name,
                              role: m.role,
                            }))}
                            statuses={statuses}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {tasks.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-[#7f7f7f]"
                      >
                        No tienes tareas asignadas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="thin-scroll flex gap-4 overflow-x-auto p-6">
            {statuses.map((s) => {
              const items = tasks.filter((t) => t.status === s.code);
              return (
                <div key={s.code} className="flex w-80 shrink-0 flex-col">
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      style={{ background: s.color }}
                      className="h-2.5 w-2.5 rounded-full"
                    />
                    <span className="text-sm font-semibold">{s.label}</span>
                    <span className="rounded bg-[#eceff1] px-1.5 text-xs text-[#5d6b77]">
                      {items.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {items.map((t) => {
                      const due = dueInfo(t.dueDate, finalCodes.has(t.status));
                      const hrs = t.timeEntries.reduce((a, e) => a + e.hours, 0);
                      return (
                        <div
                          key={t.id}
                          className="rounded-xl border border-[#e4e8ec] bg-white p-3"
                        >
                          <div className="mb-1.5 flex items-center gap-1.5">
                            <ClientTag name={t.client.code || t.client.name} />
                            <PriorityTag priority={t.priority} />
                            {unreadIds.has(t.id) && (
                              <span
                                title="El cliente respondió y nadie lo ha visto"
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#d21f3c]"
                              />
                            )}
                            {t.clientPriority && (
                              <span className="text-[11px] text-[#c97416]">
                                ★{t.clientPriority}/5
                              </span>
                            )}
                          </div>
                          <Link
                            href={`/solicitudes/${t.key}`}
                            className="block hover:underline"
                          >
                            <div className="text-sm font-semibold leading-snug">
                              {t.title}
                            </div>
                          </Link>
                          <div className="mt-1 line-clamp-2 text-xs text-[#5d6b77]">
                            {t.description}
                          </div>
                          <div className="mt-2 space-y-0.5 text-[11px] text-[#7f7f7f]">
                            <div>
                              {t.key} · ingreso {shortDate(t.createdAt)} ·
                              entrega {shortDate(t.dueDate)}
                            </div>
                            <div className="truncate">
                              ✉ {t.requesterEmail || "—"} · 📎{" "}
                              {t.attachments.length} · 💬 {t.comments.length}
                              {hrs > 0 && <> · ◷ {hoursLabel(hrs)}</>}
                            </div>
                          </div>
                          {due && (
                            <div
                              className={`mt-2 rounded-md border px-2 py-1 text-[11px] font-semibold ${toneCls[due.tone]}`}
                            >
                              ⏰ {due.text}
                            </div>
                          )}
                          <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#f1f3f4] pt-2">
                            <StatusSelect requestId={t.id} value={t.status} statuses={statuses} />
                            <HandoffPanel
                              requestId={t.id}
                              teammates={teammates.map((m) => ({
                                id: m.id,
                                name: m.name,
                                role: m.role,
                              }))}
                              statuses={statuses}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {items.length === 0 && (
                      <div className="rounded-xl border border-dashed border-[#e4e8ec] p-3 text-center text-xs text-[#6b7280]">
                        Sin tareas
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
