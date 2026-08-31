import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { canActOnRequest } from "@/lib/authz";

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
    include: { request: true },
  });
  if (!attachment) return new Response("No encontrado", { status: 404 });

  const allowed =
    user.role === "CLIENTE"
      ? user.clientId === attachment.request.clientId
      : canActOnRequest(user, attachment.request);
  if (!allowed) return new Response("No autorizado", { status: 403 });

  const file = path.join(process.cwd(), "uploads", safe);
  try {
    const buf = await readFile(file);
    const ext = path.extname(safe).toLowerCase();
    const type =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".gif"
              ? "image/gif"
              : "application/octet-stream";
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
}
