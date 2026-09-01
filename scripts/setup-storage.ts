// Corre una sola vez: crea el bucket privado de Storage para los adjuntos.
// npx tsx scripts/setup-storage.ts
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { ATTACHMENTS_BUCKET } from "../lib/storage";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: existing } = await supabase.storage.listBuckets();
  if (existing?.some((b) => b.name === ATTACHMENTS_BUCKET)) {
    console.log(`Bucket "${ATTACHMENTS_BUCKET}" ya existe, nada que hacer.`);
    return;
  }

  const { error } = await supabase.storage.createBucket(ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024, // igual al MAX_FILE_SIZE_BYTES de lib/files.ts
  });
  if (error) throw error;
  console.log(`Bucket "${ATTACHMENTS_BUCKET}" creado (privado).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
