import { PrismaClient } from "@prisma/client";

// Solicitudes en la papelera (Request.deletedAt) no existen para la app:
// toda lectura directa de Request las excluye acá, una sola vez, en vez de
// repetir el filtro en cada consulta. Para leerlas (papelera, restaurar) se
// pasa deletedAt explícito en el where. Ojo: no alcanza a las relaciones
// anidadas (include: { subtasks }, requests: {...}, _count) — esas llevan
// su propio deletedAt: null.
const READS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

function createClient() {
  return new PrismaClient({ log: ["error", "warn"] }).$extends({
    query: {
      request: {
        $allOperations({ operation, args, query }) {
          if (READS.has(operation)) {
            const a = args as { where?: { deletedAt?: unknown } };
            if (a.where?.deletedAt === undefined) a.where = { ...a.where, deletedAt: null };
          }
          return query(args);
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
