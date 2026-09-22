// Backfill del slug de Client — mismo mecanismo que seed-project-slugs.ts:
// corre en cada deploy vía prisma/seed.ts, solo toca clientes sin slug
// todavía. Los clientes nuevos ya nacen con uno (ver createClient).
import { PrismaClient } from "@prisma/client";
import { uniqueSlug } from "../lib/slug";

const prisma = new PrismaClient();

export async function seedClientSlugs(client: PrismaClient = prisma) {
  const pending = await client.client.findMany({
    where: { slug: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  for (const c of pending) {
    const slug = await uniqueSlug(c.name, async (s) => (await client.client.count({ where: { slug: s } })) > 0);
    await client.client.update({ where: { id: c.id }, data: { slug } });
  }
}

if (require.main === module) {
  seedClientSlugs()
    .then(() => {
      console.log("slugs de cliente rellenados");
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
