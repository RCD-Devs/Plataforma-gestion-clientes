import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_MAP } from "@/lib/constants";
import { Avatar, StatusBadge, StatCard } from "@/components/ui";
import { hoursLabel, shortDate } from "@/lib/format";
import { daysFromToday, endOfToday, toDateInput } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function EquipoPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; equipo?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "LIDER_AREA" && user.role !== "ADMIN")
    redirect("/mi-espacio");

  const sp = await searchParams;
  const now = new Date();
  const desde = sp.desde
    ? new Date(`${sp.desde}T00:00:00`)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const hasta = sp.hasta ? new Date(`${sp.hasta}T23:59:59`) : endOfToday();
  const equipo = sp.equipo ?? user.teamId ?? "all";

  const teams = await prisma.team.findMany({
    include: { members: true },
    orderBy: { name: "asc" },
  });
  const memberIds =
    equipo === "all"
      ? undefined
      : (teams.find((t) => t.id === equipo)?.members.map((m) => m.id) ?? []);

  // Incluye también las tareas del equipo sin responsable asignado
  // (assigneeId null no matchea un IN) y las recién llegadas sin equipo.
  const taskWhere: Prisma.RequestWhereInput =
    memberIds !== undefined
      ? {
          OR: [
            { assigneeId: { in: memberIds } },
            { teamId: equipo },
            { AND: [{ assigneeId: null }, { teamId: null }] },
          ],
        }
      : {};

  const [tasks, entries] = await Promise.all([
    prisma.request.findMany({
      where: taskWhere,
      include: { client: true, assignee: true },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.timeEntry.findMany({
      where: {
        date: { gte: desde, lte: hasta },
        ...(memberIds !== undefined ? { userId: { in: memberIds } } : {}),
      },
      include: { user: true, request: { include: { client: true } } },
    }),
  ]);

  const open = tasks.filter((t) => t.status !== "FINALIZADA");
  const overdue = open.filter(
    (t) => t.dueDate && daysFromToday(t.dueDate) < 0,
  );
  const dueSoon = open.filter((t) => {
    if (!t.dueDate) return false;
    const d = daysFromToday(t.dueDate);
    return d >= 0 && d <= 7;
  });
  const totalHours = entries.reduce((a, e) => a + e.hours, 0);

  const byUser = new Map<string, { name: string; color: string | null; role: string; hours: number }>();
  const byClient = new Map<string, { name: string; hours: number }>();
  for (const e of entries) {
    const u = byUser.get(e.userId) ?? {
      name: e.user.name,
      color: e.user.color,
      role: e.user.role,
      hours: 0,
    };
    u.hours += e.hours;
    byUser.set(e.userId, u);
    const c = byClient.get(e.request.clientId) ?? {
      name: e.request.client.name,
      hours: 0,
    };
    c.hours += e.hours;
    byClient.set(e.request.clientId, c);
  }
  const perUser = [...byUser.values()].sort((a, b) => b.hours - a.hours);
  const perClient = [...byClient.values()].sort((a, b) => b.hours - a.hours);
  const maxU = Math.max(1, ...perUser.map((u) => u.hours));
  const maxC = Math.max(1, ...perClient.map((c) => c.hours));

  const fmt = toDateInput;
  const inputCls =
    "h-8 rounded-md border border-[#e4e8ec] bg-white px-2 text-sm outline-none focus:border-[#0bdbcf]";

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e4e8ec] bg-white px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-brand text-base font-semibold">Mi equipo</h1>
            <p className="text-xs text-[#5d6b77]">
              Vista de líder · horas, entregas y retrasos
            </p>
          </div>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <select name="equipo" defaultValue={equipo} className={inputCls}>
              <option value="all">Todos los equipos</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-[#5d6b77]">
              Desde
              <input
                name="desde"
                type="date"
                defaultValue={fmt(desde)}
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-[#5d6b77]">
              Hasta
              <input
                name="hasta"
                type="date"
                defaultValue={fmt(hasta)}
                className={inputCls}
              />
            </label>
            <button className="h-8 rounded-md bg-[#0bdbcf] px-3 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
              Aplicar
            </button>
          </form>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Tareas abiertas" value={open.length} hint={`${tasks.length} en total`} />
          <StatCard
            label="Horas en el período"
            value={hoursLabel(totalHours)}
            hint={`${shortDate(desde)} — ${shortDate(hasta)}`}
          />
          <StatCard
            label="Entregas próximas (7 días)"
            value={dueSoon.length}
          />
          <StatCard
            label="Tareas atrasadas"
            value={
              <span style={{ color: overdue.length ? "#d21f3c" : undefined }}>
                {overdue.length}
              </span>
            }
          />
        </div>

        {overdue.length > 0 && (
          <section className="rounded-xl border border-[#f7c3c9] bg-[#fdeef0] p-4">
            <h2 className="mb-2 text-sm font-semibold text-[#a01830]">
              🚨 Alertas de retraso
            </h2>
            <div className="space-y-1.5">
              {overdue.map((t) => {
                const days = -daysFromToday(t.dueDate!);
                return (
                  <Link
                    key={t.id}
                    href={`/solicitudes/${t.key}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm hover:bg-white"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {t.assignee && (
                        <Avatar name={t.assignee.name} color={t.assignee.color} size={20} />
                      )}
                      <span className="truncate">
                        <span className="font-semibold">{t.key}</span> · {t.title}{" "}
                        <span className="text-[#5d6b77]">({t.client.name})</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-[#a01830]">
                      {days === 0 ? "vence hoy" : `${days} día${days === 1 ? "" : "s"} de retraso`}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-[#e4e8ec] bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold">
              Horas por perfil{" "}
              <span className="font-normal text-[#7f7f7f]">
                · {shortDate(desde)} — {shortDate(hasta)}
              </span>
            </h2>
            <div className="space-y-3">
              {perUser.map((u) => (
                <div key={u.name} className="flex items-center gap-3">
                  <Avatar name={u.name} color={u.color} size={24} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex justify-between text-xs">
                      <span className="truncate">
                        {u.name}{" "}
                        <span className="text-[#7f7f7f]">
                          · {ROLE_MAP[u.role]?.label ?? u.role}
                        </span>
                      </span>
                      <span className="font-semibold">{hoursLabel(u.hours)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-[#eceff1]">
                      <div
                        style={{ width: `${(u.hours / maxU) * 100}%`, background: "#08a89f" }}
                        className="h-full rounded"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {perUser.length === 0 && (
                <div className="text-sm text-[#7f7f7f]">
                  Sin horas registradas en el período.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[#e4e8ec] bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold">
              Horas por cliente{" "}
              <span className="font-normal text-[#7f7f7f]">
                · {shortDate(desde)} — {shortDate(hasta)}
              </span>
            </h2>
            <div className="space-y-3">
              {perClient.map((c) => (
                <div key={c.name}>
                  <div className="mb-0.5 flex justify-between text-xs">
                    <span>{c.name}</span>
                    <span className="font-semibold">{hoursLabel(c.hours)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-[#eceff1]">
                    <div
                      style={{ width: `${(c.hours / maxC) * 100}%`, background: "#16324a" }}
                      className="h-full rounded"
                    />
                  </div>
                </div>
              ))}
              {perClient.length === 0 && (
                <div className="text-sm text-[#7f7f7f]">
                  Sin horas registradas en el período.
                </div>
              )}
            </div>
          </section>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-[#5d6b77]">
            Tareas del equipo ({open.length} abiertas)
          </h2>
          <div className="overflow-x-auto rounded-xl border border-[#e4e8ec] bg-white">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-[#e4e8ec] text-left text-xs text-[#5d6b77]">
                  <th className="px-4 py-2.5 font-semibold">Tarea</th>
                  <th className="px-4 py-2.5 font-semibold">Responsable</th>
                  <th className="px-4 py-2.5 font-semibold">Cliente</th>
                  <th className="px-4 py-2.5 font-semibold">Entrega</th>
                  <th className="px-4 py-2.5 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {open.map((t) => {
                  const late = t.dueDate && daysFromToday(t.dueDate) < 0;
                  return (
                    <tr key={t.id} className="border-b border-[#f1f3f4] last:border-0 hover:bg-[#f8fafb]">
                      <td className="px-4 py-3">
                        <Link href={`/solicitudes/${t.key}`}>
                          <span className="text-xs text-[#7f7f7f]">{t.key}</span>{" "}
                          <span className="font-semibold">{t.title}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {t.assignee ? (
                          <span className="inline-flex items-center gap-2">
                            <Avatar name={t.assignee.name} color={t.assignee.color} size={20} />
                            {t.assignee.name}
                          </span>
                        ) : (
                          <span className="text-[#9aa5ad]">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{t.client.name}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span style={{ color: late ? "#d21f3c" : undefined, fontWeight: late ? 600 : 400 }}>
                          {shortDate(t.dueDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                    </tr>
                  );
                })}
                {open.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[#7f7f7f]">
                      Sin tareas abiertas para este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
