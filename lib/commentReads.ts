import { prisma } from "./db";

// Qué solicitudes tienen un comentario del cliente que este usuario todavía
// no ha visto — para el indicador "cliente respondió, nadie lo ha visto".
export async function getUnreadRequestIds(
  userId: string,
  requestIds: string[],
): Promise<Set<string>> {
  if (requestIds.length === 0) return new Set();

  const [latestClientComments, reads] = await Promise.all([
    prisma.comment.findMany({
      where: { requestId: { in: requestIds }, isClient: true },
      orderBy: { createdAt: "desc" },
      distinct: ["requestId"],
      select: { requestId: true, createdAt: true },
    }),
    prisma.commentRead.findMany({
      where: { userId, requestId: { in: requestIds } },
      select: { requestId: true, readAt: true },
    }),
  ]);

  const readMap = new Map(reads.map((r) => [r.requestId, r.readAt]));
  const unread = new Set<string>();
  for (const c of latestClientComments) {
    const readAt = readMap.get(c.requestId);
    if (!readAt || c.createdAt > readAt) unread.add(c.requestId);
  }
  return unread;
}
