import { prisma } from "@/lib/db";
import { createClient } from "@/app/actions";
import { hasAccess, attachCapabilities } from "@/lib/permissions";
import { ClientForm } from "@/components/admin/ClientForm";

export const dynamic = "force-dynamic";

export default async function NuevoClientePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    include: { roles: { include: { role: { include: { permissions: true } } } } },
  });
  const managers = users
    .map(attachCapabilities)
    .filter((u) => hasAccess(u.capabilities, "clients.view"));

  return (
    <ClientForm
      managers={managers}
      teamUsers={users.filter((u) => u.role !== "CLIENTE" && u.isActive)}
      error={error}
      action={createClient}
      submitLabel="Crear cliente"
    />
  );
}
