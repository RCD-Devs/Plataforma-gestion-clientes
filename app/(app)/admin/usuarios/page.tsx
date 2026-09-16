import Link from "next/link";
import { prisma } from "@/lib/db";
import { setUserActive } from "@/app/actions";
import { ActiveToggle } from "@/components/admin/ActiveToggle";
import { ROLE_MAP } from "@/lib/constants";
import { Avatar } from "@/components/ui";
import { getStatuses } from "@/lib/statuses";

export const dynamic = "force-dynamic";

export default async function AdminUsuariosPage() {
  const users = await prisma.user.findMany({
    include: { team: true, client: true },
    orderBy: { name: "asc" },
  });

  // Nuevo #12 — al desactivar a alguien, sus solicitudes abiertas quedan
  // asignadas sin aviso. Por decisión del dueño del proyecto (16 sep) solo
  // se avisa acá, sin reasignación automática ni cambios al modelo de datos.
  const statuses = await getStatuses();
  const finalCodes = statuses.filter((s) => s.isFinal).map((s) => s.code);
  const orphaned = await prisma.request.findMany({
    where: {
      archivedAt: null,
      status: { notIn: finalCodes },
      assignee: { isActive: false },
    },
    select: { id: true, key: true, title: true, assignee: { select: { name: true } } },
    orderBy: { key: "asc" },
  });

  return (
    <div className="p-6">
      {orphaned.length > 0 && (
        <div className="mb-4 rounded-xl border border-[#fda565] bg-[#fdf1e3] p-4">
          <h2 className="mb-2 text-sm font-semibold text-[#9a5a25]">
            ⚠️ {orphaned.length} solicitud{orphaned.length === 1 ? "" : "es"}{" "}
            asignada{orphaned.length === 1 ? "" : "s"} a alguien inactivo
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {orphaned.map((r) => (
              <Link
                key={r.id}
                href={`/solicitudes/${r.key}`}
                className="rounded-md border border-[#fda565] bg-white px-2 py-1 text-xs text-[#5d3a16] hover:bg-[#fdf1e3]"
                title={`${r.title} — asignada a ${r.assignee?.name}`}
              >
                {r.key}
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[#6b7280]">{users.length} usuarios</p>
        <Link
          href="/admin/usuarios/nuevo"
          className="rounded-md bg-[#0bdbcf] px-3 py-1.5 text-xs font-semibold text-[#081826] hover:bg-[#09c4ba]"
        >
          + Nuevo usuario
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#e6e8eb] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e6e8eb] text-left text-xs text-[#6b7280]">
              <th className="px-4 py-2.5 font-medium">Usuario</th>
              <th className="px-4 py-2.5 font-medium">Rol</th>
              <th className="px-4 py-2.5 font-medium">Equipo</th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-[#f3f4f6] last:border-0">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <Avatar name={u.name} color={u.color} size={22} />
                    <span>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-[#6b7280]">{u.email}</div>
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3">{ROLE_MAP[u.role]?.label ?? u.role}</td>
                <td className="px-4 py-3 text-[#6b7280]">{u.team?.name || "—"}</td>
                <td className="px-4 py-3 text-[#6b7280]">{u.client?.name || "—"}</td>
                <td className="px-4 py-3">
                  <ActiveToggle id={u.id} isActive={u.isActive} action={setUserActive} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/usuarios/${u.id}`}
                    className="text-xs font-semibold text-[#08a89f] hover:underline"
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#6b7280]">
                  Aún no hay usuarios creados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
