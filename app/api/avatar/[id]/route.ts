import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// Foto de perfil. La URL lleva ?v=<avatarUpdatedAt> (ver avatarSrc), así
// que se cachea como inmutable: una foto nueva = URL nueva.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  const avatar = await prisma.userAvatar.findUnique({ where: { userId: id } });
  if (!avatar) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(avatar.data), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
