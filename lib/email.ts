import { prisma } from "./db";

// Notificación interna para colaboradores (campana en "Mi espacio"):
// traspasos de tareas, cambios de prioridad del cliente, feedback, etc.
export async function notifyTeam(opts: {
  to: string;
  requestId?: string;
  title: string;
  body: string;
}) {
  if (!opts.to) return;
  // eslint-disable-next-line no-console
  console.log(`\n🔔  [equipo → ${opts.to}] ${opts.title}\n    ${opts.body}\n`);
  await prisma.notification.create({
    data: {
      recipientEmail: opts.to,
      requestId: opts.requestId,
      title: opts.title,
      body: opts.body,
      channel: "team",
    },
  });
}

// Desarrollo: registra el correo en consola y lo guarda como notificación
// (canal email + in-app). En producción se reemplaza por Resend/SMTP.
export async function notifyClient(opts: {
  to: string;
  requestId?: string;
  title: string;
  body: string;
}) {
  if (!opts.to) return;
  // eslint-disable-next-line no-console
  console.log(`\n📧  [email → ${opts.to}] ${opts.title}\n    ${opts.body}\n`);
  await prisma.notification.createMany({
    data: [
      {
        recipientEmail: opts.to,
        requestId: opts.requestId,
        title: opts.title,
        body: opts.body,
        channel: "email",
      },
      {
        recipientEmail: opts.to,
        requestId: opts.requestId,
        title: opts.title,
        body: opts.body,
        channel: "inapp",
      },
    ],
  });
}
