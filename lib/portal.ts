import { cookies } from "next/headers";
import { prisma } from "./db";
import type { Client } from "@prisma/client";

// Identifica a qué cliente (empresa) pertenece un correo:
// 1) match exacto con el correo de contacto del cliente
// 2) mismo dominio que el correo de contacto (p. ej. juan@achs.cl → ACHS)
// 3) correo que ya ingresó solicitudes para un cliente
export async function findClientByEmail(
  email: string,
): Promise<Client | null> {
  const norm = email.trim().toLowerCase();
  if (!norm.includes("@")) return null;
  const domain = norm.split("@")[1];

  const exact = await prisma.client.findFirst({
    where: { contactEmail: norm },
  });
  if (exact) return exact;

  const all = await prisma.client.findMany();
  const byDomain = all.find((c) =>
    c.contactEmail?.toLowerCase().endsWith("@" + domain),
  );
  if (byDomain) return byDomain;

  const prev = await prisma.request.findFirst({
    where: { requesterEmail: norm },
    include: { client: true },
    orderBy: { createdAt: "desc" },
  });
  return prev?.client ?? null;
}

export type PortalSession = { email: string; client: Client };

export async function getPortalSession(): Promise<PortalSession | null> {
  const store = await cookies();
  const email = store.get("revo_client_email")?.value;
  if (!email) return null;
  const client = await findClientByEmail(email);
  if (!client) return null;
  return { email, client };
}
