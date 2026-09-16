// Borra toda la data de negocio de ejemplo (clientes, solicitudes y todo lo
// que cuelga de ellas, usuarios, equipos) dejando solo la cuenta admin
// indicada. Mantiene configuración real: Status (estados del tablero),
// CustomFieldDefinition (campos personalizados) y AuditLog (bitácora de
// seguridad — no es data de prueba). Resetea Counter para que la próxima
// solicitud arranque en MBA-1.
//
// TOMA UN RESPALDO ANTES DE CORRER ESTO (Supabase → Database → Backups, o
// pg_dump) — no hay vuelta atrás.
//
// Uso:
//   DATABASE_URL="postgres://..." npx tsx scripts/wipe-demo-data.ts
//     → dry run, solo muestra qué borraría
//   DATABASE_URL="postgres://..." npx tsx scripts/wipe-demo-data.ts --confirm
//     → borra de verdad
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "desarrollo@rompecabeza.cl";
const ADMIN_NAME = "Desarrollo";

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function redactedDbHost() {
  try {
    const url = new URL(process.env.DATABASE_URL || "");
    return `${url.hostname}${url.pathname}`;
  } catch {
    return "(DATABASE_URL no parece una URL válida)";
  }
}

// Deja lista la cuenta admin que sobrevive a la limpieza. Si ya existe, solo
// se asegura de que sea ADMIN y esté activa (no toca su contraseña). Si no
// existe, la crea igual que createUser() en app/actions.ts — sin contraseña,
// con un link de "restablecer-contraseña" para que la defina quien la use.
async function ensureAdmin(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    if (existing.role !== "ADMIN" || !existing.isActive) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: "ADMIN", isActive: true },
      });
      console.log(`Cuenta ${ADMIN_EMAIL} ajustada a ADMIN/activa.`);
    } else {
      console.log(`Cuenta ${ADMIN_EMAIL} ya existe como ADMIN activo — se mantiene tal cual.`);
    }
    return existing.id;
  }

  const created = await prisma.user.create({
    data: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      role: "ADMIN",
      isActive: true,
      mustChangePassword: true,
    },
  });

  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: created.id,
      tokenHash: hashResetToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  console.log(`\nCuenta ${ADMIN_EMAIL} creada. Define la contraseña en (el link vence en 1 hora):`);
  console.log(`${appUrl}/restablecer-contrasena?token=${rawToken}\n`);
  return created.id;
}

async function main() {
  const confirmed = process.argv.includes("--confirm");
  console.log(`Base de datos: ${redactedDbHost()}`);

  const keepId = await ensureAdmin();

  const counts = {
    clientes: await prisma.client.count(),
    solicitudes: await prisma.request.count(),
    usuarios_a_borrar: await prisma.user.count({ where: { id: { not: keepId } } }),
    equipos: await prisma.team.count(),
  };
  console.log("Se borrará:", counts);
  console.log("Se mantiene: Status, CustomFieldDefinition, AuditLog, y la cuenta admin indicada.");

  if (!confirmed) {
    console.log("\nDry run — no se borró nada. Corre de nuevo con --confirm para ejecutar.");
    return;
  }

  // Orden que respeta las llaves foráneas del esquema real (ver
  // prisma/schema.prisma): borrar Request primero deja en cascada
  // Attachment/Comment/TimeEntry/Activity/CustomFieldValue/CommentRead/
  // RequestCollaborator. Client y User se referencian mutuamente
  // (Client.accountManagerId ↔ User.clientId) — hay que romper esa
  // referencia cruzada antes de poder borrar cualquiera de las dos.
  await prisma.request.deleteMany();
  await prisma.project.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.slaAlertLog.deleteMany();
  await prisma.hoursAlertLog.deleteMany();
  await prisma.nudgeShown.deleteMany();
  await prisma.aiMemoryNote.deleteMany();

  await prisma.client.updateMany({ data: { accountManagerId: null } });
  await prisma.user.update({ where: { id: keepId }, data: { teamId: null, clientId: null } });

  await prisma.user.deleteMany({ where: { id: { not: keepId } } });
  await prisma.team.deleteMany();
  await prisma.client.deleteMany(); // cascada: HoursAdjustment
  await prisma.counter.deleteMany();

  console.log(`\nListo. Solo queda ${ADMIN_EMAIL}. El próximo folio será MBA-1.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
