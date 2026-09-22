// Backfill de Client.code — mismo mecanismo que seed-client-slugs.ts:
// corre en cada deploy vía prisma/seed.ts, solo toca clientes sin código
// todavía. Los clientes nuevos ya nacen con uno (ver createClient).
//
// Importante: NO renombra los folios ya creados (siguen con el prefijo
// "MBA" histórico, fijo y global, que usaba nextKey() antes de este
// cambio) — solo asegura que cada cliente tenga su propio código para
// que sus PRÓXIMAS solicitudes usen un folio propio (ACHS-1, ACHS-2...)
// en vez de seguir sumando al contador global de "MBA".
import { PrismaClient } from "@prisma/client";
import { uniqueClientCode } from "../lib/clientCode";

const prisma = new PrismaClient();

export async function seedClientCodes(client: PrismaClient = prisma) {
  const pending = await client.client.findMany({
    where: { code: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  for (const c of pending) {
    const code = await uniqueClientCode(c.name, async (s) => (await client.client.count({ where: { code: s } })) > 0);
    await client.client.update({ where: { id: c.id }, data: { code } });
  }
}

if (require.main === module) {
  seedClientCodes()
    .then(() => {
      console.log("códigos de cliente rellenados");
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
