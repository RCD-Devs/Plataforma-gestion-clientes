import { prisma } from "@/lib/db";
import { STATUSES } from "@/lib/constants";
import { StatCard } from "@/components/ui";
import { hoursLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [requests, entries, clients] = await Promise.all([
    prisma.request.findMany({ select: { status: true } }),
    prisma.timeEntry.findMany({ select: { hours: true, date: true } }),
    prisma.client.findMany({
      include: {
        requests: { include: { timeEntries: { select: { hours: true } } } },
      },
    }),
  ]);

  const open = requests.filter((r) => r.status !== "FINALIZADA").length;
  const monthHours = entries
    .filter((t) => new Date(t.date) >= monthStart)
    .reduce((a, t) => a + t.hours, 0);
  const totalContracted = clients.reduce((a, c) => a + c.contractedHours, 0);
  const totalConsumed = clients.reduce(
    (a, c) =>
      a +
      c.requests.reduce(
        (x, r) => x + r.timeEntries.reduce((y, t) => y + t.hours, 0),
        0,
      ),
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
            value={hoursLabel(Math.max(0, totalContracted - totalConsumed))}
            hint={`${hoursLabel(totalConsumed)} de ${hoursLabel(totalContracted)}`}
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
            <h2 className="mb-4 text-sm font-semibold">Consumo por cliente</h2>
            <div className="space-y-3">
              {clients
                .filter((c) => c.contractedHours > 0)
                .map((c) => {
                  const consumed = c.requests.reduce(
                    (x, r) =>
                      x + r.timeEntries.reduce((y, t) => y + t.hours, 0),
                    0,
                  );
                  const pct = (consumed / c.contractedHours) * 100;
                  return (
                    <div key={c.id}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>{c.name}</span>
                        <span className="text-[#6b7280]">
                          {hoursLabel(consumed)} / {hoursLabel(c.contractedHours)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded bg-[#f3f4f6]">
                        <div
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            background:
                              pct > 90
                                ? "#d21f3c"
                                : pct > 70
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
