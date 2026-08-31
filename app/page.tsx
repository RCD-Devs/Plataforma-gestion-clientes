import { redirect } from "next/navigation";
import { getSessionUser, redirectForRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(redirectForRole(user));
}
