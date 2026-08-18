import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const safe = path.basename(id);
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
