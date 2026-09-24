import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { updateTeam } from "@/app/actions";
import { TeamForm } from "@/components/admin/TeamForm";

export const dynamic = "force-dynamic";

export default async function EditarEquipoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [team, users] = await Promise.all([
    prisma.team.findUnique({ where: { id } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!team) notFound();

  return (
    <TeamForm
      team={team}
      users={users}
      error={error}
      action={updateTeam.bind(null, id)}
      submitLabel="Guardar cambios"
    />
  );
}
