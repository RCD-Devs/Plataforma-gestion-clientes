import Link from "next/link";
import { prisma } from "@/lib/db";
import { setUserActive } from "@/app/actions";
import { ActiveToggle } from "@/components/admin/ActiveToggle";
import { ROLE_MAP } from "@/lib/constants";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminUsuariosPage() {
  const users = await prisma.user.findMany({
    include: { team: true, client: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6">
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
                      <div className="text-xs text-[#9ca3af]">{u.email}</div>
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
                <td colSpan={6} className="px-4 py-10 text-center text-[#9ca3af]">
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
