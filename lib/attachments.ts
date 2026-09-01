import crypto from "crypto";
import { prisma } from "./db";
import { sniffFile, MAX_FILE_SIZE_BYTES } from "./files";
import { uploadToStorage } from "./storage";

// Único punto donde se valida, sube y registra un archivo adjunto — antes
// duplicado entre /api/upload (equipo) y submitClientRequest (portal).
export async function storeUploadedFile(requestId: string, file: File | null) {
  if (!file || file.size === 0 || file.size > MAX_FILE_SIZE_BYTES) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  const sig = sniffFile(bytes);
  if (!sig) return null;

  const id = crypto.randomUUID();
  await uploadToStorage(id + sig.ext, bytes, sig.contentType);
  return prisma.attachment.create({
    data: {
      requestId,
      kind: sig.kind,
      name: file.name,
      url: `/api/files/${id}${sig.ext}`,
    },
  });
}
