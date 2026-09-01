import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { updateClient } from "@/app/actions";
import { isManager } from "@/lib/authz";
import { ClientForm } from "@/components/admin/ClientForm";

export const dynamic = "force-dynamic";

export default async function EditarClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [client, users] = await Promise.all([
    prisma.client.findUnique({ where: { id } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!client) notFound();
  const managers = users.filter((u) => isManager(u.role));

  return (
    <ClientForm
      client={client}
      managers={managers}
      error={error}
      action={updateClient.bind(null, id)}
      submitLabel="Guardar cambios"
    />
  );
}
