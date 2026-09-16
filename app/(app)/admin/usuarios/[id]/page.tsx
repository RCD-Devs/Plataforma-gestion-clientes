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
  const [editing, teams, clients, roles, editingRoles] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.userRole.findMany({ where: { userId: id }, select: { roleId: true } }),
  ]);
  if (!editing) notFound();

  return (
    <UserForm
      editing={editing}
      editingRoleIds={editingRoles.map((r) => r.roleId)}
      roles={roles}
      teams={teams}
      clients={clients}
      error={error}
      action={updateUser.bind(null, id)}
      submitLabel="Guardar cambios"
    />
  );
}
