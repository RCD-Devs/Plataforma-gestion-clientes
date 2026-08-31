import { prisma } from "./db";

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

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

// Recuperación de contraseña — mismo patrón stub: se registra en consola y
// como notificación in-app hasta que se conecte un proveedor real
// (Resend/SMTP, Rec. #41). El link no debe llegar nunca por otro canal que
// no sea el correo real, así que por ahora solo queda visible en el log del
// servidor para poder probar el flujo en desarrollo.
export async function sendPasswordReset(opts: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  const fullUrl = `${appBaseUrl()}${opts.resetUrl}`;
  // eslint-disable-next-line no-console
  console.log(`\n🔑  [recuperar contraseña → ${opts.to}]\n    ${fullUrl}\n`);
  await prisma.notification.create({
    data: {
      recipientEmail: opts.to,
      title: "Recupera tu contraseña",
      body: `Hola ${opts.name}, usa este enlace para elegir una nueva contraseña: ${fullUrl}`,
      channel: "email",
    },
  });
}
