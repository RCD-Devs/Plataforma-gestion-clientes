import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isTeamRole } from "@/lib/authz";
import { evaluateNudgeItems, NUDGE_LABELS } from "@/lib/nudges";
import { relative } from "@/lib/format";
import { deleteTeamAlerts, markTeamAlertsRead } from "@/app/actions";

export const dynamic = "force-dynamic";

const LIMIT = 300;

// Todas mis notificaciones (la campana solo muestra las 12 últimas) y los
// pendientes completos (la campana muestra 5 por tipo).
export default async function MisNotificacionesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isTeamRole(user.role)) redirect("/portal");

  const [alerts, nudges] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientEmail: user.email, channel: "team" },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
    evaluateNudgeItems(user.id, Infinity),
  ]);
  const keys = new Map(
    (
      await prisma.request.findMany({
        where: { id: { in: alerts.flatMap((n) => (n.requestId ? [n.requestId] : [])) } },
        select: { id: true, key: true },
      })
    ).map((r) => [r.id, r.key]),
  );
  const pending = nudges.filter((n) => NUDGE_LABELS[n.kind]);
  const unread = alerts.filter((n) => !n.read).length;
  const read = alerts.length - unread;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e8ec] bg-white px-6 py-3">
        <div>
          <Link href="/mi-espacio" className="text-xs text-[#5d6b77] hover:underline">
            ← Mi espacio
          </Link>
          <h1 className="font-brand text-base font-semibold">Mis notificaciones</h1>
          <p className="text-xs text-[#5d6b77]">
            {alerts.length} notificaciones · {unread} sin leer
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <form action={markTeamAlertsRead}>
              <button className="rounded-lg border border-[#e4e8ec] px-3 py-1.5 text-xs font-semibold hover:bg-[#f1f3f4]">
                Marcar todas leídas
              </button>
            </form>
          )}
          {read > 0 && (
            <form action={deleteTeamAlerts}>
              <button className="rounded-lg border border-[#f7c3c9] px-3 py-1.5 text-xs font-semibold text-[#a01830] hover:bg-[#fdeef0]">
                Borrar leídas ({read})
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {pending.length > 0 && (
          <section className="rounded-xl border border-[#fda565] bg-[#fdf1e3]/60 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#9a5a25]">
              Pendientes
            </h2>
            <div className="space-y-4">
              {pending.map((item) => {
                const label = NUDGE_LABELS[item.kind]!;
                return (
                  <div key={item.kind}>
                    <div className="mb-1.5 text-sm font-semibold text-[#7a4419]">
                      {label.icon} {label.title(item.taskCount)}
                    </div>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {item.tasks.map((t) => (
                        <li key={t.id}>
                          <Link
                            href={`/solicitudes/${t.key}`}
                            className="block truncate rounded-md border border-[#fda565] bg-white px-2 py-1 text-xs text-[#5d3a16] hover:bg-[#fdf1e3]"
                          >
                            <span className="font-semibold">{t.key}</span> · {t.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="divide-y divide-[#f1f3f4] rounded-xl border border-[#e4e8ec] bg-white">
          {alerts.map((n) => {
            const key = n.requestId ? keys.get(n.requestId) : undefined;
            return (
              <div key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.read ? "" : "bg-[#e0fbf9]/60"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    {key ? (
                      <Link href={`/solicitudes/${key}`} className="text-sm font-semibold hover:text-[#08a89f] hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold">{n.title}</span>
                    )}
                    <span className="shrink-0 text-[11px] text-[#7f7f7f]">{relative(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#5d6b77]">{n.body}</p>
                </div>
                <form action={deleteTeamAlerts}>
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    aria-label="Borrar notificación"
                    title="Borrar"
                    className="rounded px-1.5 text-sm text-[#7f7f7f] hover:bg-[#fdeef0] hover:text-[#a01830]"
                  >
                    ✕
                  </button>
                </form>
              </div>
            );
          })}
          {alerts.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-[#7f7f7f]">Sin notificaciones.</div>
          )}
          {alerts.length === LIMIT && (
            <div className="px-4 py-3 text-center text-xs text-[#7f7f7f]">
              Mostrando las {LIMIT} más recientes. Borra las leídas para ver las anteriores.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
