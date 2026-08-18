import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const requestId = String(form.get("requestId") || "");
  const back = new URL(req.headers.get("referer") || "/", req.url);

  if (!file || !requestId || file.size === 0) {
    return NextResponse.redirect(back, { status: 303 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const dir = path.join(process.cwd(), "uploads");
  await mkdir(dir, { recursive: true });

  const id = crypto.randomUUID();
  const ext = path.extname(file.name) || "";
  await writeFile(path.join(dir, id + ext), bytes);

  const type = file.type || "";
  const kind = type.includes("pdf")
    ? "pdf"
    : type.includes("image")
      ? "png"
      : "file";

  await prisma.attachment.create({
    data: {
      requestId,
      kind,
      name: file.name,
      url: `/api/files/${id}${ext}`,
    },
  });

  return NextResponse.redirect(back, { status: 303 });
}
