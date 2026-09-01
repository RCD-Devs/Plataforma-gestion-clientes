import { prisma } from "@/lib/db";
import { createUser } from "@/app/actions";
import { UserForm } from "@/components/admin/UserForm";

export const dynamic = "force-dynamic";

export default async function NuevoUsuarioPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [teams, clients] = await Promise.all([
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <UserForm
      teams={teams}
      clients={clients}
      error={error}
      action={createUser}
      submitLabel="Crear usuario"
    />
  );
}
