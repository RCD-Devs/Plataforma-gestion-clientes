import { prisma } from "@/lib/db";
import { createClient } from "@/app/actions";
import { isManager } from "@/lib/authz";
import { ClientForm } from "@/components/admin/ClientForm";

export const dynamic = "force-dynamic";

export default async function NuevoClientePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const managers = users.filter((u) => isManager(u.role));

  return (
    <ClientForm
      managers={managers}
      error={error}
      action={createClient}
      submitLabel="Crear cliente"
    />
  );
}
