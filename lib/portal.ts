import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSessionUser } from "./session";

export const PORTAL_CLIENT_COOKIE = "portal_client";

// Quién está usando el portal y para qué cliente. Dos casos:
//  - cuenta CLIENTE: siempre su cliente.
//  - usuario de equipo con acceso (UserClientAccess): "ver como cliente"
//    del cliente elegido en el selector (cookie), por defecto el primero.
export async function getPortalContext() {
  const user = await getSessionUser();
  if (!user) return null;
  if (user.role === "CLIENTE") {
    if (!user.client) return null;
    return { user, client: user.client, clients: [user.client], viewAs: false };
  }
  const rows = await prisma.userClientAccess.findMany({
    where: { userId: user.id },
    include: { client: true },
  });
  const clients = rows.map((r) => r.client).sort((a, b) => a.name.localeCompare(b.name));
  if (clients.length === 0) return null;
  const chosen = (await cookies()).get(PORTAL_CLIENT_COOKIE)?.value;
  const client = clients.find((c) => c.id === chosen) ?? clients[0];
  return { user, client, clients, viewAs: true };
}

// Guardia común de las páginas del portal (excepto /portal, que además
// muestra el login cuando no hay sesión).
export async function requirePortalUser() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal");
  if (ctx.user.mustChangePassword) redirect("/cambiar-clave");
  return { ...ctx, email: ctx.user.email };
}

// ¿Puede este usuario actuar como cliente sobre `clientId`? (comentar,
// priorizar, crear solicitudes). Cuenta CLIENTE: solo el suyo; equipo:
// solo si el Admin le dio acceso.
export async function canActAsClient(
  user: { id: string; role: string; clientId: string | null },
  clientId: string,
) {
  if (user.role === "CLIENTE") return user.clientId === clientId;
  return (
    (await prisma.userClientAccess.count({ where: { userId: user.id, clientId } })) > 0
  );
}
