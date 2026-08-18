import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(
    user.role === "LIDER_AREA" || user.role === "ADMIN"
      ? "/equipo"
      : "/mi-espacio",
  );
}
