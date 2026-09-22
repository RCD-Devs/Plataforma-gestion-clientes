// Backfill del slug de Project (Rec. URL legible, 22 sep 2026) — corre en
// cada deploy vía prisma/seed.ts, igual que seed-roles.ts. Solo toca
// proyectos que todavía no tienen slug (los nuevos ya nacen con uno, ver
// createProject/createNewProject en app/actions.ts); idempotente.
import { PrismaClient } from "@prisma/client";
import { uniqueSlug } from "../lib/slug";

const prisma = new PrismaClient();

export async function seedProjectSlugs(client: PrismaClient = prisma) {
  const pending = await client.project.findMany({
    where: { slug: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  for (const p of pending) {
    const slug = await uniqueSlug(p.name, async (s) => (await client.project.count({ where: { slug: s } })) > 0);
    await client.project.update({ where: { id: p.id }, data: { slug } });
  }
}

if (require.main === module) {
  seedProjectSlugs()
    .then(() => {
      console.log("slugs de proyecto rellenados");
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
