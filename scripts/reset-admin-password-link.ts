// Reemite un link de "definir/restablecer contraseña" para una cuenta ya
// existente, sin depender del envío de correo (útil mientras el dominio de
// Resend no esté verificado — Rec. #43). Mismo mecanismo que "¿Olvidaste tu
// contraseña?" del login, corrido a mano.
//
// Uso: DATABASE_URL="postgres://..." npx tsx scripts/reset-admin-password-link.ts <correo>
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: npx tsx scripts/reset-admin-password-link.ts <correo>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No existe ningún usuario con el correo ${email}`);
    process.exit(1);
  }

  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashResetToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://plataforma-gestion-clientes.vercel.app";
  console.log(`\nLink para ${email} (vence en 1 hora):`);
  console.log(`${appUrl}/restablecer-contrasena?token=${rawToken}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
