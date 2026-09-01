import { Resend } from "resend";
import { prisma } from "./db";

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

let resend: Resend | null = null;
function resendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resend) resend = new Resend(key);
  return resend;
}

// Envío real vía Resend (Rec. #41). Sin RESEND_API_KEY configurada, cae al
// mismo stub de consola que ya existía — así el resto del equipo sigue
// pudiendo correr la app en local sin tener que crear una cuenta de Resend.
// Un correo que falla nunca debe tumbar el flujo que lo dispara.
async function sendEmail(opts: { to: string; subject: string; html: string }) {
  const client = resendClient();
  if (!client) {
    // eslint-disable-next-line no-console
    console.log(`\n📧  [email, sin RESEND_API_KEY → ${opts.to}] ${opts.subject}\n`);
    return;
  }
  const from = process.env.EMAIL_FROM || "REVO <onboarding@resend.dev>";
  try {
    const { error } = await client.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) console.error("Resend rechazó el correo:", error);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error enviando correo:", err);
  }
}

// Notificación interna para colaboradores (campana en "Mi espacio"):
// traspasos de tareas, cambios de prioridad del cliente, feedback, etc.
// Queda solo in-app a propósito — no es correo transaccional al cliente.
export async function notifyTeam(opts: {
  to: string;
  requestId?: string;
  title: string;
  body: string;
}) {
  if (!opts.to) return;
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

export async function notifyClient(opts: {
  to: string;
  requestId?: string;
  title: string;
  body: string;
}) {
  if (!opts.to) return;
  await sendEmail({
    to: opts.to,
    subject: opts.title,
    html: `<p>${opts.body}</p>`,
  });
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

export async function sendPasswordReset(opts: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  const fullUrl = `${appBaseUrl()}${opts.resetUrl}`;
  await sendEmail({
    to: opts.to,
    subject: "Recupera tu contraseña",
    html: `<p>Hola ${opts.name},</p><p>Usa este enlace para elegir una nueva contraseña (vence en 1 hora):</p><p><a href="${fullUrl}">${fullUrl}</a></p>`,
  });
  await prisma.notification.create({
    data: {
      recipientEmail: opts.to,
      title: "Recupera tu contraseña",
      body: `Hola ${opts.name}, usa este enlace para elegir una nueva contraseña: ${fullUrl}`,
      channel: "email",
    },
  });
}
