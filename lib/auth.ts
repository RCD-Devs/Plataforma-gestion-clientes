import { cookies } from "next/headers";
import { prisma } from "./db";

export async function getCurrentUser() {
  const store = await cookies();
  const id = store.get("revo_uid")?.value;
  if (!id) return null;
  return prisma.user.findUnique({
    where: { id },
    include: { team: true, client: true },
  });
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
