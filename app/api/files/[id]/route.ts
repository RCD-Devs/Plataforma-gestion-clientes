import { NextRequest } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { canActOnRequest } from "@/lib/authz";
import { getSignedDownloadUrl } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const safe = path.basename(id);

  const user = await getSessionUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const attachment = await prisma.attachment.findFirst({
    where: { url: `/api/files/${safe}` },
    include: { request: { include: { client: true } } },
  });
  if (!attachment) return new Response("No encontrado", { status: 404 });

  const allowed =
    user.role === "CLIENTE"
      ? user.clientId === attachment.request.clientId
      : canActOnRequest(user, attachment.request);
  if (!allowed) return new Response("No autorizado", { status: 403 });

  try {
    const signedUrl = await getSignedDownloadUrl(safe, 60);
    // Cada visita revalida sesión/autorización y firma un link nuevo — el
    // redirect no se cachea (para que eso siga siendo cierto en la
    // próxima visita), y la URL firmada en sí deja de servir a los 60s.
    return new Response(null, {
      status: 302,
      headers: { Location: signedUrl, "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
}
