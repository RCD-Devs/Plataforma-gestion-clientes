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

// Rec. #39 — en vez de que nuestro propio servidor descargue y reenvíe
// los bytes, se emite un link temporal directo al bucket. La
// autorización sigue pasando por /api/files/[id] (Rec. #8/#9) antes de
// llamar a esto; lo que cambia es que el link resultante deja de sernos
// útil a los pocos segundos, en vez de quedar servible para siempre
// mientras la sesión exista.
export async function getSignedDownloadUrl(
  path: string,
  expiresInSeconds = 60,
): Promise<string> {
  const { data, error } = await storageClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw error ?? new Error("No se pudo firmar la URL");
  return data.signedUrl;
}
