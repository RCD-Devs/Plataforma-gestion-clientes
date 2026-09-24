import Link from "next/link";
import { prisma } from "@/lib/db";
import { setUserActive } from "@/app/actions";
import { ActiveToggle } from "@/components/admin/ActiveToggle";
import { ResendInviteButton } from "@/components/admin/ResendInviteButton";
import { UserDeleteButton } from "@/components/admin/UserDeleteButton";
import { ROLE_MAP } from "@/lib/constants";
import { Avatar } from "@/components/ui";
import { getStatuses } from "@/lib/statuses";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });

// Estado de la contraseña: distingue "nunca la definió" (invitación pendiente
// o vencida) de "ya la definió".
function passwordStatus(u: {
  passwordHash: string | null;
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
  resetTokens: { usedAt: Date | null; expiresAt: Date }[];
}) {
  if (!u.passwordHash) {
    const t = u.resetTokens[0];
    return t && !t.usedAt && t.expiresAt > new Date()
      ? { label: "Invitación pendiente", detail: `vence ${fmt(t.expiresAt)}`, cls: "bg-[#fff4e5] text-[#9a4a1e]" }
      : { label: "Invitación vencida", detail: "necesita enlace nuevo", cls: "bg-[#feede6] text-[#b42318]" };
  }
  if (u.mustChangePassword)
    return { label: "Debe cambiarla", detail: "", cls: "bg-[#fff4e5] text-[#9a4a1e]" };
  return {
    label: "Definida",
    detail: u.passwordChangedAt ? fmt(u.passwordChangedAt) : "",
    cls: "bg-[#e6f7f5] text-[#08a89f]",
  };
}

export default async function AdminUsuariosPage() {
  const [sessionUser, users] = await Promise.all([
    getSessionUser(),
    prisma.user.findMany({
      include: {
        team: true,
        client: true,
        assigned: { select: { id: true } },
        timeEntries: { select: { id: true } },
        managedClients: { select: { id: true } },
        resetTokens: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { name: "asc" },
    }),
  ]);

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
              <th className="px-4 py-2.5 font-medium">Contraseña</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5 font-medium"></th>
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
                  {(() => {
                    const ps = passwordStatus(u);
                    return (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ps.cls}`}>
                        {ps.label}
                        {ps.detail && <span className="font-normal"> · {ps.detail}</span>}
                      </span>
                    );
                  })()}
                  {!u.passwordHash && u.isActive && (
                    <div className="mt-1">
                      <ResendInviteButton id={u.id} />
                    </div>
                  )}
                </td>
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
                <td className="px-4 py-3 text-right">
                  <UserDeleteButton
                    id={u.id}
                    disabled={
                      u.id === sessionUser?.id ||
                      u.assigned.length > 0 ||
                      u.timeEntries.length > 0 ||
                      u.managedClients.length > 0
                    }
                  />
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-[#6b7280]">
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
