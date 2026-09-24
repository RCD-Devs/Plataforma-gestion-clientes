import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

// Usuarios, roles, equipos, etc. siguen siendo solo Admin; el layout
// padre también deja pasar a quien tiene clients.manage (ver clientes/).
export default async function SoloAdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user?.roleCodes.includes("ADMIN")) redirect("/admin/clientes");
  return children;
}
