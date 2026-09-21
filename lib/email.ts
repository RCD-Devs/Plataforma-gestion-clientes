import { Resend } from "resend";
import { prisma } from "./db";
import { serverInstance as rollbar } from "./rollbar";

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

// Envoltorio visual compartido por todos los correos transaccionales —
// tablas + estilos inline porque los clientes de correo (Gmail, Outlook)
// ignoran <style> externo y muchas reglas modernas de CSS.
function emailLayout(opts: { title: string; bodyHtml: string; ctaLabel?: string; ctaUrl?: string }) {
  const logoUrl = `${appBaseUrl()}/brand/logo-blanco.png`;
  const cta = opts.ctaUrl
    ? `<tr><td style="padding:28px 40px 8px;">
        <a href="${opts.ctaUrl}" style="display:inline-block;background:#0bdbcf;color:#081826;font-weight:600;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:8px;">${opts.ctaLabel}</a>
       </td></tr>
       <tr><td style="padding:0 40px 8px;">
        <p style="margin:0;font-size:12px;color:#9aa3ad;word-break:break-all;">Si el botón no funciona, copia y pega este enlace: <a href="${opts.ctaUrl}" style="color:#08a89f;">${opts.ctaUrl}</a></p>
       </td></tr>`
    : "";
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#081826;padding:24px 40px;">
          <img src="${logoUrl}" height="28" alt="REVO" style="display:block;" />
        </td></tr>
        <tr><td style="padding:32px 40px 8px;">
          <h1 style="margin:0 0 12px;font-size:18px;color:#081826;">${opts.title}</h1>
          <div style="font-size:14px;line-height:1.6;color:#3b4552;">${opts.bodyHtml}</div>
        </td></tr>
        ${cta}
        <tr><td style="padding:24px 40px 28px;">
          <p style="margin:0;font-size:12px;color:#9aa3ad;">Plataforma de gestión de clientes · Grupo Revo</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
    if (error) {
      rollbar.error("Resend rechazó el correo", { extra: { to: opts.to, subject: opts.subject, error } });
    }
  } catch (err) {
    rollbar.error(err instanceof Error ? err : new Error(String(err)), {
      extra: { to: opts.to, subject: opts.subject },
    });
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
    html: emailLayout({ title: opts.title, bodyHtml: `<p style="margin:0;">${opts.body}</p>` }),
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

export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  const fullUrl = `${appBaseUrl()}${opts.resetUrl}`;
  await sendEmail({
    to: opts.to,
    subject: "Te dieron de alta en la Plataforma REVO",
    html: emailLayout({
      title: `Hola ${opts.name}`,
      bodyHtml: `<p style="margin:0;">Ya tienes una cuenta en la Plataforma de gestión de clientes. Define tu contraseña para empezar (el enlace vence en 72 horas y solo sirve el último que recibas):</p>`,
      ctaLabel: "Definir contraseña",
      ctaUrl: fullUrl,
    }),
  });
  await prisma.notification.create({
    data: {
      recipientEmail: opts.to,
      title: "Te dieron de alta en la Plataforma REVO",
      body: `Hola ${opts.name}, usa este enlace para definir tu contraseña: ${fullUrl}`,
      channel: "email",
    },
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
    html: emailLayout({
      title: `Hola ${opts.name}`,
      bodyHtml: `<p style="margin:0;">Elige una nueva contraseña para tu cuenta (el enlace vence en 1 hora y solo sirve el último que recibas):</p>`,
      ctaLabel: "Elegir nueva contraseña",
      ctaUrl: fullUrl,
    }),
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
