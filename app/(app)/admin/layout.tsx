import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { canManageClients } from "@/lib/permissions";
import { AdminTabs } from "./AdminTabs";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageClients(user)) redirect("/mi-espacio");
  const isAdmin = user.roleCodes.includes("ADMIN");

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e6e8eb] bg-white px-6 py-3">
        <h1 className="font-brand text-base font-semibold">Administración</h1>
        <p className="text-xs text-[#6b7280]">
          {isAdmin ? "Clientes, usuarios y equipos — solo Admin" : "Clientes"}
        </p>
        <AdminTabs isAdmin={isAdmin} />
      </header>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
