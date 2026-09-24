import { prisma } from "@/lib/db";
import { createTeam } from "@/app/actions";
import { TeamForm } from "@/components/admin/TeamForm";

export const dynamic = "force-dynamic";

export default async function NuevoEquipoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <TeamForm
      users={users}
      error={error}
      action={createTeam}
      submitLabel="Crear equipo"
    />
  );
}
