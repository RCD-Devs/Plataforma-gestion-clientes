import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isManager } from "@/lib/authz";
import { Bar } from "@/components/ui";
import { hoursLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isManager(user.role)) redirect("/mi-espacio");

  const clients = await prisma.client.findMany({
    include: {
      requests: { include: { timeEntries: { select: { hours: true } } } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e6e8eb] bg-white px-6 py-3">
        <h1 className="font-brand text-base font-semibold">Clientes</h1>
        <p className="text-xs text-[#6b7280]">
          {clients.length} clientes · bolsa de horas y solicitudes
        </p>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const consumed = c.requests.reduce(
              (a, r) => a + r.timeEntries.reduce((x, t) => x + t.hours, 0),
              0,
            );
            const pct =
              c.contractedHours > 0 ? (consumed / c.contractedHours) * 100 : 0;
            const open = c.requests.filter(
              (r) => r.status !== "FINALIZADA",
            ).length;
            return (
              <div
                key={c.id}
                className="rounded-xl border border-[#e6e8eb] bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{c.name}</div>
                  {c.code && (
                    <span className="rounded bg-[#f3f4f6] px-1.5 py-0.5 text-xs text-[#6b7280]">
                      {c.code}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-[#6b7280]">
                  <span>
                    {c.requests.length} solicitudes · {open} abiertas
                  </span>
                  <Link
                    href={`/clientes/${c.id}/reporte`}
                    className="font-semibold text-[#08a89f] hover:underline"
                  >
                    Ver reporte →
                  </Link>
                </div>
                {c.contractedHours > 0 ? (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-[#6b7280]">Bolsa de horas</span>
                      <span className="font-medium">
                        {hoursLabel(consumed)} / {hoursLabel(c.contractedHours)}
                      </span>
                    </div>
                    <Bar
                      pct={pct}
                      color={
                        pct > 90 ? "#d21f3c" : pct > 70 ? "#c97416" : "#0e9f6e"
                      }
                    />
                    <div className="mt-1 text-xs text-[#6b7280]">
                      Saldo:{" "}
                      {hoursLabel(Math.max(0, c.contractedHours - consumed))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-[#9ca3af]">
                    Sin bolsa configurada · {hoursLabel(consumed)} cargadas
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
