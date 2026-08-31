import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isManager } from "@/lib/authz";
import { Avatar, Bar } from "@/components/ui";
import { hoursLabel, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BolsaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isManager(user.role)) redirect("/mi-espacio");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [clients, entries] = await Promise.all([
    prisma.client.findMany({
      include: { requests: { include: { timeEntries: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.timeEntry.findMany({
      include: { user: true, request: { include: { client: true } } },
      orderBy: { date: "desc" },
      take: 25,
    }),
  ]);

  const rows = clients.map((c) => {
    const all = c.requests.flatMap((r) => r.timeEntries);
    const consumed = all.reduce((a, t) => a + t.hours, 0);
    const month = all
      .filter((t) => new Date(t.date) >= monthStart)
      .reduce((a, t) => a + t.hours, 0);
    return { c, consumed, month, saldo: c.contractedHours - consumed };
  });

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e6e8eb] bg-white px-6 py-3">
        <h1 className="font-brand text-base font-semibold">Bolsa de horas</h1>
        <p className="text-xs text-[#6b7280]">
          Consumo por cliente y registro de horas (timesheet)
        </p>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="overflow-hidden rounded-xl border border-[#e6e8eb] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e6e8eb] text-left text-xs text-[#6b7280]">
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Contratadas</th>
                <th className="px-4 py-2.5 font-medium">Este mes</th>
                <th className="px-4 py-2.5 font-medium">Consumidas</th>
                <th className="px-4 py-2.5 font-medium">Saldo</th>
                <th className="w-40 px-4 py-2.5 font-medium">Uso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, consumed, month, saldo }) => {
                const pct =
                  c.contractedHours > 0
                    ? (consumed / c.contractedHours) * 100
                    : 0;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-[#f3f4f6] last:border-0"
                  >
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3">
                      {c.contractedHours > 0
                        ? hoursLabel(c.contractedHours)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">{hoursLabel(month)}</td>
                    <td className="px-4 py-3">{hoursLabel(consumed)}</td>
                    <td className="px-4 py-3">
                      <span
                        style={{ color: saldo < 0 ? "#d21f3c" : "#0e9f6e" }}
                      >
                        {c.contractedHours > 0 ? hoursLabel(saldo) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.contractedHours > 0 ? (
                        <Bar
                          pct={pct}
                          color={
                            pct > 90
                              ? "#d21f3c"
                              : pct > 70
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
                      className="px-4 py-8 text-center text-[#9ca3af]"
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
