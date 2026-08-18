import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="flex">
      <Sidebar
        user={{
          name: user.name,
          role: user.role,
          email: user.email,
          color: user.color,
        }}
      />
      <main className="h-screen flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
