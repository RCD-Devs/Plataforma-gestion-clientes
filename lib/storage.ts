import { createClient } from "@supabase/supabase-js";

export const ATTACHMENTS_BUCKET = "attachments";

// Cliente admin (service role) — server-only, nunca en el bundle del
// navegador. Bypasea RLS a propósito: la autorización real ya la hacemos
// nosotros en app/api/files/[id]/route.ts antes de llamar a esto.
function storageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function uploadToStorage(
  path: string,
  bytes: Buffer,
  contentType: string,
) {
  const { error } = await storageClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
}

export async function downloadFromStorage(path: string): Promise<Buffer> {
  const { data, error } = await storageClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}
