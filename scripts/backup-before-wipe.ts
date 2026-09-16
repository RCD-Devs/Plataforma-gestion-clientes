// Exporta un snapshot completo de la base a JSON, tabla por tabla —
// reemplaza el backup nativo de Supabase (no disponible en el plan free)
// reusando el mismo DATABASE_URL que ya se necesita para wipe-demo-data.ts.
// Sin instalar pg_dump ni nada nuevo: usa Prisma Client, que ya es
// dependencia del proyecto.
//
// Uso:
//   DATABASE_URL="postgres://..." npx tsx scripts/backup-before-wipe.ts
//
// Deja los archivos en backups/<fecha>/<tabla>.json (esa carpeta está en
// .gitignore — nunca se commitea, va a tener datos reales de clientes).
//
// No hay script de restauración todavía — si alguna vez hace falta, se
// escribe cuando se necesite: son prisma.<tabla>.createMany(JSON.parse(...))
// en el orden inverso al de borrado de wipe-demo-data.ts.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const TABLES = [
  "client",
  "project",
  "hoursAdjustment",
  "team",
  "user",
  "passwordResetToken",
  "request",
  "requestCollaborator",
  "customFieldDefinition",
  "customFieldValue",
  "commentRead",
  "attachment",
  "comment",
  "timeEntry",
  "activity",
  "notification",
  "status",
  "auditLog",
  "counter",
  "nudgeShown",
  "aiMemoryNote",
  "hoursAlertLog",
  "slaAlertLog",
] as const;

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join("backups", stamp);
  fs.mkdirSync(dir, { recursive: true });

  console.log(`Respaldando a ${dir}/`);
  let total = 0;
  for (const table of TABLES) {
    const delegate = prisma[table] as { findMany: () => Promise<unknown[]> };
    const rows = await delegate.findMany();
    fs.writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(rows, null, 2));
    console.log(`  ${table}: ${rows.length} filas`);
    total += rows.length;
  }
  console.log(`\nListo — ${total} filas en total, guardadas en ${dir}/`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
