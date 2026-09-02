import Link from "next/link";
import { prisma } from "@/lib/db";
import { setClientActive } from "@/app/actions";
import { ActiveToggle } from "@/components/admin/ActiveToggle";
import { hoursLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminClientesPage() {
  const clients = await prisma.client.findMany({
    include: { accountManager: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[#6b7280]">{clients.length} clientes</p>
        <Link
          href="/admin/clientes/nuevo"
          className="rounded-md bg-[#0bdbcf] px-3 py-1.5 text-xs font-semibold text-[#081826] hover:bg-[#09c4ba]"
        >
          + Nuevo cliente
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#e6e8eb] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e6e8eb] text-left text-xs text-[#6b7280]">
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 font-medium">Código</th>
              <th className="px-4 py-2.5 font-medium">Contacto</th>
              <th className="px-4 py-2.5 font-medium">Bolsa contratada</th>
              <th className="px-4 py-2.5 font-medium">Coordinador</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-[#f3f4f6] last:border-0">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-[#6b7280]">{c.code || "—"}</td>
                <td className="px-4 py-3 text-[#6b7280]">{c.contactEmail || "—"}</td>
                <td className="px-4 py-3">
                  {c.contractedHours > 0 ? hoursLabel(c.contractedHours) : "—"}
                </td>
                <td className="px-4 py-3 text-[#6b7280]">
                  {c.accountManager?.name || "—"}
                </td>
                <td className="px-4 py-3">
                  <ActiveToggle id={c.id} isActive={c.isActive} action={setClientActive} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/clientes/${c.id}`}
                    className="text-xs font-semibold text-[#08a89f] hover:underline"
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[#6b7280]">
                  Aún no hay clientes creados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
