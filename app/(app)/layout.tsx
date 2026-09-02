import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { Sidebar } from "@/components/Nav";
import { AiAssistant } from "@/components/AiAssistant";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "CLIENTE") redirect("/portal");
  if (user.mustChangePassword) redirect("/cambiar-clave");
  return (
    <div className="flex min-h-screen flex-col md:h-screen md:flex-row">
      <Sidebar
        user={{
          name: user.name,
          role: user.role,
          email: user.email,
          color: user.color,
        }}
      />
      <main className="flex-1 overflow-y-auto md:h-screen">{children}</main>
      <AiAssistant />
    </div>
  );
}
