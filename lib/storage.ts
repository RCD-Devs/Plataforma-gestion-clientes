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
// Nuevo #18 (auditoría de gaps, 2 sep 2026) — forzar descarga (en vez de
// verlo inline en el navegador) para todo lo que no sea una imagen que
// queremos previsualizar. Mitiga que un archivo se abra/interprete
// directo en el navegador; Supabase Storage ya soporta esto nativo vía
// el parámetro download de la URL firmada, sin proxy propio de por medio.
export async function getSignedDownloadUrl(
  path: string,
  expiresInSeconds = 60,
  download?: string | false,
): Promise<string> {
  const { data, error } = await storageClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .createSignedUrl(
      path,
      expiresInSeconds,
      download ? { download } : undefined,
    );
  if (error || !data) throw error ?? new Error("No se pudo firmar la URL");
  return data.signedUrl;
}

// Rec. #34 — al borrar un adjunto, limpiar también el archivo real del
// bucket (no solo la fila de Attachment), para no acumular basura.
export async function deleteFromStorage(path: string) {
  const { error } = await storageClient().storage.from(ATTACHMENTS_BUCKET).remove([path]);
  if (error) throw error;
}
