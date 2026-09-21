import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { updateUser } from "@/app/actions";
import { UserForm } from "@/components/admin/UserForm";

export const dynamic = "force-dynamic";

export default async function EditarUsuarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [editing, teams, clients, roles, editingRoles, editingAccess, editingMemberships] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.userRole.findMany({ where: { userId: id }, select: { roleId: true } }),
    prisma.userClientAccess.findMany({ where: { userId: id }, select: { clientId: true } }),
    prisma.clientMember.findMany({ where: { userId: id }, select: { clientId: true } }),
  ]);
  if (!editing) notFound();

  return (
    <UserForm
      editing={editing}
      editingRoleIds={editingRoles.map((r) => r.roleId)}
      editingPortalClientIds={editingAccess.map((a) => a.clientId)}
      editingMemberClientIds={editingMemberships.map((m) => m.clientId)}
      roles={roles}
      teams={teams}
      clients={clients}
      error={error}
      action={updateUser.bind(null, id)}
      submitLabel="Guardar cambios"
    />
  );
}
