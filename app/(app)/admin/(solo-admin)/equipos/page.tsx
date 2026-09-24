import Link from "next/link";
import { prisma } from "@/lib/db";
import { TeamDeleteButton } from "@/components/admin/TeamDeleteButton";

export const dynamic = "force-dynamic";

export default async function AdminEquiposPage() {
  const teams = await prisma.team.findMany({
    include: {
      members: { select: { id: true } },
      requests: { select: { id: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[#6b7280]">{teams.length} equipos</p>
        <Link
          href="/admin/equipos/nuevo"
          className="rounded-md bg-[#0bdbcf] px-3 py-1.5 text-xs font-semibold text-[#081826] hover:bg-[#09c4ba]"
        >
          + Nuevo equipo
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#e6e8eb] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e6e8eb] text-left text-xs text-[#6b7280]">
              <th className="px-4 py-2.5 font-medium">Equipo</th>
              <th className="px-4 py-2.5 font-medium">Miembros</th>
              <th className="px-4 py-2.5 font-medium">Tareas</th>
              <th className="px-4 py-2.5 font-medium"></th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id} className="border-b border-[#f3f4f6] last:border-0">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span
                      style={{ background: t.color || "#9ca3af" }}
                      className="h-2.5 w-2.5 rounded-full"
                    />
                    {t.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#6b7280]">{t.members.length}</td>
                <td className="px-4 py-3 text-[#6b7280]">{t.requests.length}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/equipos/${t.id}`}
                    className="text-xs font-semibold text-[#08a89f] hover:underline"
                  >
                    Editar
                  </Link>
                </td>
                <td className="px-4 py-3 text-right">
                  <TeamDeleteButton
                    id={t.id}
                    disabled={t.members.length > 0 || t.requests.length > 0}
                  />
                </td>
              </tr>
            ))}
            {teams.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[#6b7280]">
                  Aún no hay equipos creados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
