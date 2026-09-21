import { redirect } from "next/navigation";
import { getSessionUser } from "./session";

// Guardia común de las páginas del portal (excepto /portal, que además
// muestra el login cuando no hay sesión).
export async function requirePortalUser() {
  const user = await getSessionUser();
  if (!user || user.role !== "CLIENTE" || !user.client) redirect("/portal");
  if (user.mustChangePassword) redirect("/cambiar-clave");
  return { user, client: user.client, email: user.email };
}
