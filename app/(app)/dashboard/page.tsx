import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isManager, requestVisibilityWhere, clientVisibilityWhere } from "@/lib/authz";
import { getStatuses } from "@/lib/statuses";
import { StatCard } from "@/components/ui";
import { ReportDoughnut, GroupedBarChart } from "@/components/ReportCharts";
import { hoursLabel } from "@/lib/format";
import { getHoursSummaries } from "@/lib/hoursLedger";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const NO_TEAM = "Sin equipo";
const NO_TEAM_COLOR = "#cbd5e1";
const PALETTE = ["#08a89f", "#16324a", "#c97416", "#7c3aed", "#d21f3c", "#0e9f6e", "#2563eb", "#db2777"];

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#e6e8eb] bg-white p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-[#6b7280]">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

const Empty = () => <p className="py-8 text-center text-sm text-[#6b7280]">Sin datos</p>;

// Agrupa y ordena de mayor a menor; devuelve las N primeras.
function topBy<T>(items: T[], key: (t: T) => string, value: (t: T) => number = () => 1, n = Infinity) {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + value(it));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isManager(user)) redirect("/mi-espacio");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last30 = new Date(now.getTime() - 30 * DAY);
  const reqWhere = { ...requestVisibilityWhere(user), deletedAt: null };

  const [requests, entries, clients, statuses, teams] = await Promise.all([
    prisma.request.findMany({
      where: reqWhere,
      select: {
        key: true,
        title: true,
        status: true,
        teamId: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        finalizedAt: true,
        client: { select: { name: true } },
        assignee: { select: { name: true } },
      },
    }),
    prisma.timeEntry.findMany({
      where: { request: reqWhere, date: { gte: prevMonthStart } },
      select: {
        hours: true,
        date: true,
        request: { select: { teamId: true, client: { select: { name: true } } } },
      },
    }),
    prisma.client.findMany({
      where: { ...clientVisibilityWhere(user), isActive: true },
    }),
    getStatuses(),
    prisma.team.findMany({ select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
  ]);
  const finalCodes = new Set(statuses.filter((s) => s.isFinal).map((s) => s.code));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const teamColor = new Map(
    teams.map((t, i) => [t.name, t.color ?? PALETTE[i % PALETTE.length]]),
  );
  teamColor.set(NO_TEAM, NO_TEAM_COLOR);
  const teamOf = (id: string | null) => (id && teamName.get(id)) || NO_TEAM;

  // --- Solicitudes ---
  const openReqs = requests.filter((r) => !finalCodes.has(r.status));
  const closedReqs = requests.filter((r) => finalCodes.has(r.status));
  const closedLast30 = closedReqs.filter((r) => (r.finalizedAt ?? r.updatedAt) >= last30);
  const createdLast30 = requests.filter((r) => r.createdAt >= last30).length;
  const overdue = openReqs
    .filter((r) => r.dueDate && r.dueDate < now)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
  const unassigned = openReqs.filter((r) => !r.assignee).length;

  const openByTeam = topBy(openReqs, (r) => teamOf(r.teamId));
  const closedByTeam = topBy(closedLast30, (r) => teamOf(r.teamId));

  const counts: Record<string, number> = Object.fromEntries(
    statuses.map((s) => [s.code, requests.filter((r) => r.status === s.code).length]),
  );
  const maxCount = Math.max(1, ...Object.values(counts));

  // Carga por persona: abiertas y vencidas por responsable.
  const overdueByPerson = new Map(topBy(overdue, (r) => r.assignee?.name ?? "Sin asignar"));
  const loadByPerson = topBy(openReqs, (r) => r.assignee?.name ?? "Sin asignar", undefined, 10);

  // --- Horas ---
  const monthEntries = entries.filter((t) => t.date >= monthStart);
  const monthHours = monthEntries.reduce((a, t) => a + t.hours, 0);
  const prevMonthHours = entries
    .filter((t) => t.date < monthStart)
    .reduce((a, t) => a + t.hours, 0);
  const hoursByTeam = topBy(monthEntries, (t) => teamOf(t.request.teamId), (t) => t.hours);
  const hoursByClient = topBy(monthEntries, (t) => t.request.client.name, (t) => t.hours, 8);

  // --- Bolsas ---
  const summaries = await getHoursSummaries(clients);
  const balances = clients
    .filter((c) => c.contractedHours > 0)
    .map((c) => {
      const ledger = summaries.get(c.id)!;
      return {
        c,
        ledger,
        pct: Math.min(100, (ledger.available / c.contractedHours) * 100),
      };
    })
    .sort((a, b) => a.pct - b.pct); // los más críticos primero
  const lowBalance = balances.filter((b) => b.pct < 10 || b.ledger.extraHours > 0).length;

  const doughnut = (rows: [string, number][]) =>
    rows.length === 0 ? (
      <Empty />
    ) : (
      <ReportDoughnut
        labels={rows.map(([k]) => k)}
        values={rows.map(([, v]) => v)}
        colors={rows.map(([k]) => teamColor.get(k) ?? NO_TEAM_COLOR)}
      />
    );

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e6e8eb] bg-white px-6 py-3">
        <h1 className="font-brand text-base font-semibold">Dashboard general</h1>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Solicitudes abiertas"
            value={openReqs.length}
            hint={`${unassigned} sin asignar`}
          />
          <StatCard
            label="Vencidas"
            value={<span className={overdue.length ? "text-[#d21f3c]" : ""}>{overdue.length}</span>}
            hint="abiertas con fecha de entrega pasada"
          />
          <StatCard
            label="Cerradas · últimos 30 días"
            value={closedLast30.length}
            hint={`${createdLast30} creadas en el mismo período`}
          />
          <StatCard
            label="Horas cargadas · este mes"
            value={hoursLabel(monthHours)}
            hint={`Mes anterior: ${hoursLabel(prevMonthHours)}`}
          />
          <StatCard
            label="Clientes activos"
            value={clients.length}
            hint={lowBalance ? `${lowBalance} con bolsa crítica o en extra` : undefined}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Solicitudes abiertas por equipo">{doughnut(openByTeam)}</Panel>
          <Panel title="Solicitudes cerradas por equipo" hint="Últimos 30 días">
            {doughnut(closedByTeam)}
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Horas por equipo" hint="Este mes">
            {hoursByTeam.length === 0 ? (
              <Empty />
            ) : (
              <GroupedBarChart
                horizontal
                labels={hoursByTeam.map(([k]) => k)}
                a={hoursByTeam.map(([, v]) => round1(v))}
                aLabel="Horas"
                suffix=" h"
                height={Math.max(160, hoursByTeam.length * 36)}
              />
            )}
          </Panel>
          <Panel title="Clientes con más horas" hint="Este mes · top 8">
            {hoursByClient.length === 0 ? (
              <Empty />
            ) : (
              <GroupedBarChart
                horizontal
                labels={hoursByClient.map(([k]) => k)}
                a={hoursByClient.map(([, v]) => round1(v))}
                aLabel="Horas"
                aColor="#16324a"
                suffix=" h"
                height={Math.max(160, hoursByClient.length * 36)}
              />
            )}
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Solicitudes por estado">
            <div className="space-y-3">
              {statuses.map((s) => (
                <div key={s.code} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-[#6b7280]">{s.label}</div>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-[#f3f4f6]">
                    <div
                      style={{
                        width: `${(counts[s.code] / maxCount) * 100}%`,
                        background: s.color,
                      }}
                      className="h-full rounded"
                    />
                  </div>
                  <div className="w-10 text-right text-sm font-medium">{counts[s.code]}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Saldo por cliente" hint="Ordenado de más crítico a más holgado">
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
              {balances.length === 0 && <Empty />}
              {balances.map(({ c, ledger, pct }) => (
                <div key={c.id}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span>{c.name}</span>
                    <span className="text-[#6b7280]">
                      {hoursLabel(ledger.available)} / {hoursLabel(c.contractedHours)}
                      {ledger.extraHours > 0 && (
                        <span className="ml-1 font-semibold text-[#d21f3c]">
                          +{hoursLabel(ledger.extraHours)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-[#f3f4f6]">
                    <div
                      style={{
                        width: `${pct}%`,
                        background: pct < 10 ? "#d21f3c" : pct < 30 ? "#c97416" : "#0e9f6e",
                      }}
                      className="h-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Carga por persona" hint="Solicitudes abiertas · top 10">
            {loadByPerson.length === 0 ? (
              <Empty />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#6b7280]">
                    <th className="pb-2 font-normal">Responsable</th>
                    <th className="pb-2 text-right font-normal">Abiertas</th>
                    <th className="pb-2 text-right font-normal">Vencidas</th>
                  </tr>
                </thead>
                <tbody>
                  {loadByPerson.map(([name, n]) => (
                    <tr key={name} className="border-t border-[#f1f3f4]">
                      <td className="py-1.5">{name}</td>
                      <td className="py-1.5 text-right font-medium">{n}</td>
                      <td className="py-1.5 text-right text-[#d21f3c]">
                        {overdueByPerson.get(name) || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Vencidas más antiguas" hint="Abiertas con fecha de entrega pasada">
            {overdue.length === 0 ? (
              <Empty />
            ) : (
              <ul className="space-y-2 text-sm">
                {overdue.slice(0, 8).map((r) => (
                  <li key={r.key} className="flex items-baseline gap-2">
                    <Link
                      href={`/solicitudes/${r.key}`}
                      className="shrink-0 font-mono text-xs text-[#08a89f] hover:underline"
                    >
                      {r.key}
                    </Link>
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span className="shrink-0 text-xs text-[#6b7280]">{r.client.name}</span>
                    <span className="shrink-0 text-xs font-medium text-[#d21f3c]">
                      {Math.floor((now.getTime() - r.dueDate!.getTime()) / DAY)} d
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
