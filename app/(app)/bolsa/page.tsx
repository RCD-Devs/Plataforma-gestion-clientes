import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isManager, requestVisibilityWhere, clientVisibilityWhere } from "@/lib/authz";
import { Avatar, Bar } from "@/components/ui";
import { hoursLabel, shortDate } from "@/lib/format";
import { getHoursSummaries } from "@/lib/hoursLedger";
import { checkHoursAlerts } from "@/lib/hoursAlerts";

export const dynamic = "force-dynamic";

export default async function BolsaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isManager(user.role)) redirect("/mi-espacio");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [clients, entries] = await Promise.all([
    prisma.client.findMany({
      where: clientVisibilityWhere(user),
      include: { requests: { include: { timeEntries: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.timeEntry.findMany({
      where: { request: requestVisibilityWhere(user) },
      include: { user: true, request: { include: { client: true } } },
      orderBy: { date: "desc" },
      take: 25,
    }),
  ]);
  const summaries = await getHoursSummaries(clients);
  await checkHoursAlerts(clients, summaries);

  const rows = clients.map((c) => {
    const all = c.requests.flatMap((r) => r.timeEntries);
    const month = all
      .filter((t) => new Date(t.date) >= monthStart)
      .reduce((a, t) => a + t.hours, 0);
    return { c, month, ledger: summaries.get(c.id)! };
  });

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e6e8eb] bg-white px-6 py-3">
        <h1 className="font-brand text-base font-semibold">Bolsa de horas</h1>
        <p className="text-xs text-[#6b7280]">
          Saldo por cliente (con arrastre de hasta 3 meses) y registro de horas
        </p>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="overflow-hidden rounded-xl border border-[#e6e8eb] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e6e8eb] text-left text-xs text-[#6b7280]">
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Por ciclo</th>
                <th className="px-4 py-2.5 font-medium">Este mes</th>
                <th className="px-4 py-2.5 font-medium">Disponible</th>
                <th className="px-4 py-2.5 font-medium">Extra</th>
                <th className="w-40 px-4 py-2.5 font-medium">Uso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, month, ledger }) => {
                const pctRemaining =
                  c.contractedHours > 0
                    ? Math.min(100, (ledger.available / c.contractedHours) * 100)
                    : 0;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-[#f3f4f6] last:border-0"
                  >
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3">
                      {c.contractedHours > 0
                        ? `${hoursLabel(c.contractedHours)} / ${c.cycleMonths === 1 ? "mes" : `${c.cycleMonths}m`}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">{hoursLabel(month)}</td>
                    <td className="px-4 py-3">
                      {c.contractedHours > 0 ? hoursLabel(ledger.available) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {ledger.extraHours > 0 ? (
                        <span style={{ color: "#d21f3c" }}>+{hoursLabel(ledger.extraHours)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.contractedHours > 0 ? (
                        <Bar
                          pct={pctRemaining}
                          color={
                            pctRemaining < 10
                              ? "#d21f3c"
                              : pctRemaining < 30
                                ? "#c97416"
                                : "#0e9f6e"
                          }
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-[#6b7280]">
            Últimos registros
          </h2>
          <div className="overflow-hidden rounded-xl border border-[#e6e8eb] bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e6e8eb] text-left text-xs text-[#6b7280]">
                  <th className="px-4 py-2.5 font-medium">Persona</th>
                  <th className="px-4 py-2.5 font-medium">Solicitud</th>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Detalle</th>
                  <th className="px-4 py-2.5 font-medium">Horas</th>
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-[#f3f4f6] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <Avatar
                          name={t.user.name}
                          color={t.user.color}
                          size={20}
                        />
                        {t.user.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#6b7280]">
                      {t.request.key}
                    </td>
                    <td className="px-4 py-3">{t.request.client.name}</td>
                    <td className="px-4 py-3 text-[#6b7280]">
                      {t.note || "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {hoursLabel(t.hours)}
                    </td>
                    <td className="px-4 py-3 text-[#6b7280]">
                      {shortDate(t.date)}
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-[#6b7280]"
                    >
                      Aún no hay horas registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
