// Siembra el contador atómico de folios (Rec. #65/#67) una sola vez,
// calculando el máximo actual de Request.key con el mismo escaneo que
// hacía nextKey() antes de este cambio — pero corrido una única vez, no
// en cada creación. No pisa el contador si ya existe: una vez sembrado,
// el contador manda solo (evita retroceder un valor ya avanzado por uso
// real). Idempotente — segura de correr más de una vez o contra una base
// ya poblada; prisma/seed.ts la llama automáticamente.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function seedRequestCounter(client: PrismaClient = prisma) {
  const existing = await client.counter.findUnique({
    where: { id: "request_key" },
  });
  if (existing) return;

  const reqs = await client.request.findMany({ select: { key: true } });
  let max = 0;
  for (const r of reqs) {
    const m = r.key.match(/(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  await client.counter.create({ data: { id: "request_key", value: max } });
}

if (require.main === module) {
  seedRequestCounter()
    .then(() => {
      console.log("contador de folios sembrado");
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
