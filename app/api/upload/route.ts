import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { canActOnRequest } from "@/lib/authz";
import { sniffFile, MAX_FILE_SIZE_BYTES } from "@/lib/files";
import { rateLimit } from "@/lib/rateLimit";
import { uploadToStorage } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const requestId = String(form.get("requestId") || "");
  const back = new URL(req.headers.get("referer") || "/", req.url);

  if (!file || !requestId || file.size === 0 || file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.redirect(back, { status: 303 });
  }

  const user = await getSessionUser();
  const target = await prisma.request.findUnique({
    where: { id: requestId },
    include: { client: true },
  });
  if (!user || !target || !canActOnRequest(user, target)) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  if (!rateLimit(`upload:${user.id}`, 30, 10 * 60 * 1000)) {
    return new NextResponse("Demasiadas subidas seguidas, espera unos minutos", { status: 429 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const sig = sniffFile(bytes);
  if (!sig) {
    return NextResponse.redirect(back, { status: 303 });
  }

  const id = crypto.randomUUID();
  await uploadToStorage(id + sig.ext, bytes, sig.contentType);

  await prisma.attachment.create({
    data: {
      requestId,
      kind: sig.kind,
      name: file.name,
      url: `/api/files/${id}${sig.ext}`,
    },
  });

  return NextResponse.redirect(back, { status: 303 });
}
