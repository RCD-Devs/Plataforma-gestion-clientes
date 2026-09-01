import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isManager, requestVisibilityWhere, clientVisibilityWhere } from "@/lib/authz";
import { STATUSES } from "@/lib/constants";
import { StatCard } from "@/components/ui";
import { hoursLabel } from "@/lib/format";
import { getHoursSummaries } from "@/lib/hoursLedger";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isManager(user.role)) redirect("/mi-espacio");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [requests, entries, clients] = await Promise.all([
    prisma.request.findMany({
      where: requestVisibilityWhere(user),
      select: { status: true },
    }),
    prisma.timeEntry.findMany({
      where: { request: requestVisibilityWhere(user) },
      select: { hours: true, date: true },
    }),
    prisma.client.findMany({
      where: clientVisibilityWhere(user),
    }),
  ]);

  const open = requests.filter((r) => r.status !== "FINALIZADA").length;
  const monthHours = entries
    .filter((t) => new Date(t.date) >= monthStart)
    .reduce((a, t) => a + t.hours, 0);
  const summaries = await getHoursSummaries(clients);
  const totalAvailable = clients.reduce(
    (a, c) => a + (summaries.get(c.id)?.available ?? 0),
    0,
  );
  const totalExtra = clients.reduce(
    (a, c) => a + (summaries.get(c.id)?.extraHours ?? 0),
    0,
  );
  const counts: Record<string, number> = Object.fromEntries(
    STATUSES.map((s) => [s.key, requests.filter((r) => r.status === s.key).length]),
  );
  const maxCount = Math.max(1, ...Object.values(counts));

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e6e8eb] bg-white px-6 py-3">
        <h1 className="font-brand text-base font-semibold">Dashboard</h1>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Solicitudes abiertas"
            value={open}
            hint={`${requests.length} en total`}
          />
          <StatCard
            label="Horas cargadas · este mes"
            value={hoursLabel(monthHours)}
          />
          <StatCard
            label="Saldo total de bolsas"
            value={hoursLabel(totalAvailable)}
            hint={totalExtra > 0 ? `+${hoursLabel(totalExtra)} extra` : undefined}
          />
          <StatCard label="Clientes activos" value={clients.length} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-[#e6e8eb] bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold">
              Solicitudes por estado
            </h2>
            <div className="space-y-3">
              {STATUSES.map((s) => (
                <div key={s.key} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-[#6b7280]">{s.label}</div>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-[#f3f4f6]">
                    <div
                      style={{
                        width: `${(counts[s.key] / maxCount) * 100}%`,
                        background: s.color,
                      }}
                      className="h-full rounded"
                    />
                  </div>
                  <div className="w-6 text-right text-sm font-medium">
                    {counts[s.key]}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#e6e8eb] bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold">Saldo por cliente</h2>
            <div className="space-y-3">
              {clients
                .filter((c) => c.contractedHours > 0)
                .map((c) => {
                  const ledger = summaries.get(c.id)!;
                  const pctRemaining = Math.min(
                    100,
                    (ledger.available / c.contractedHours) * 100,
                  );
                  return (
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
                            width: `${pctRemaining}%`,
                            background:
                              pctRemaining < 10
                                ? "#d21f3c"
                                : pctRemaining < 30
                                  ? "#c97416"
                                  : "#0e9f6e",
                          }}
                          className="h-full"
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
