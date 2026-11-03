// Sube los adjuntos de JIRA (ya descargados por download-attachments.ts del
// Jira Migrator, como <carpeta>/<id>__<nombre>) a Supabase Storage y los
// asocia a la solicitud importada por scripts/import-jira.ts. Correr DESPUÉS
// de ese import.
//
// Idempotente por archivo: cada adjunto queda como /api/files/jira-<id>.<ext>
// y si esa fila ya existe se salta. Imágenes/PDF igual que una subida normal;
// el resto (docx, zip, xlsx…) queda como "FILE", que /api/files siempre
// entrega como descarga, nunca inline.
//
// Uso (sin --apply solo muestra el plan):
//   DATABASE_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/import-jira-attachments.ts "<jira.db>" "<carpeta attachments>" [--apply]
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { sniffFile, MAX_FILE_SIZE_BYTES } from "../lib/files";
import { uploadToStorage } from "../lib/storage";

const prisma = new PrismaClient();
const MARK = "Importado de JIRA: "; // mismo prefijo que import-jira.ts

type Att = { id: string; filename: string; size: number; created: string };

async function main() {
  const [dbPath, dir] = process.argv.slice(2);
  const apply = process.argv.includes("--apply");
  if (!dbPath || !dir || dir.startsWith("--")) throw new Error('Uso: npx tsx scripts/import-jira-attachments.ts "<jira.db>" "<carpeta>" [--apply]');
  console.log(`Base de datos: ${new URL(process.env.DATABASE_URL ?? "").hostname} · ${apply ? "APLICANDO" : "solo plan"}\n`);

  const jira = new DatabaseSync(dbPath, { readOnly: true });
  const requestByKey = new Map(
    (await prisma.request.findMany({ where: { description: { startsWith: MARK } }, select: { id: true, description: true } })).map((r) => [
      r.description.slice(MARK.length).split(/\s/)[0],
      r.id,
    ]),
  );
  const done = new Set(
    (await prisma.attachment.findMany({ where: { url: { startsWith: "/api/files/jira-" } }, select: { url: true } })).map((a) => a.url),
  );

  const stats = { subidos: 0, yaEstaban: 0, sinSolicitud: 0, sinArchivo: 0, sobreLimite: 0, noImagenNiPdf: 0 };
  for (const row of jira.prepare("select key, raw_json from issues").all() as { key: string; raw_json: string }[]) {
    for (const a of (JSON.parse(row.raw_json).fields.attachment ?? []) as Att[]) {
      if (a.size > MAX_FILE_SIZE_BYTES) {
        stats.sobreLimite++;
        continue;
      }
      const requestId = requestByKey.get(row.key);
      if (!requestId) {
        stats.sinSolicitud++; // p. ej. proyecto MPDD, que no se importa
        continue;
      }
      const file = path.join(dir, `${a.id}__${a.filename.replace(/[\\/:*?"<>|]/g, "_")}`);
      if (!existsSync(file)) {
        stats.sinArchivo++;
        console.warn(`  falta el archivo descargado: ${row.key} ${a.filename}`);
        continue;
      }
      const bytes = readFileSync(file);
      const sig = sniffFile(bytes);
      if (!sig) stats.noImagenNiPdf++;
      const ext = sig?.ext ?? (path.extname(a.filename).toLowerCase().match(/^\.[a-z0-9]{1,8}$/)?.[0] ?? "");
      const storagePath = `jira-${a.id}${ext}`;
      const url = `/api/files/${storagePath}`;
      if (done.has(url)) {
        stats.yaEstaban++;
        continue;
      }
      if (apply) {
        try {
          await uploadToStorage(storagePath, bytes, sig?.contentType ?? "application/octet-stream");
        } catch (e) {
          // Subido en una corrida anterior que se cortó antes de crear la fila.
          if (!/exists|duplicate/i.test(String((e as Error).message))) throw e;
        }
        await prisma.attachment.create({
          data: { requestId, kind: sig?.kind ?? "file", name: a.filename, url, createdAt: new Date(a.created.replace(/([+-]\d\d)(\d\d)$/, "$1:$2")) },
        });
      }
      stats.subidos++;
    }
  }
  console.log(apply ? "Listo:" : "Plan (sin --apply no se sube nada):", stats);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
