import { prisma } from "./db";

// Nunca debe tumbar el flujo real por un problema de logging.
export async function logAudit(opts: {
  type: string;
  actorId?: string | null;
  actorEmail?: string | null;
  ip?: string | null;
  detail?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        type: opts.type,
        actorId: opts.actorId ?? null,
        actorEmail: opts.actorEmail ?? null,
        ip: opts.ip ?? null,
        detail: opts.detail,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("No se pudo registrar el evento de auditoría:", err);
  }
}
