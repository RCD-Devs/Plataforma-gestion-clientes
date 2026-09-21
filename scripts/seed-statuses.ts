// Siembra los estados por defecto (los mismos que estaban hardcodeados en
// lib/constants.ts hasta Rec. #36 entrega 2). Idempotente — upsert por code,
// seguro de correr más de una vez. Referencia si hay que reconstruir un
// entorno desde cero; prisma/seed.ts la llama automáticamente.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_STATUSES = [
  // Sin triaje (Nuevo #13): estado de llegada del formulario público y del
  // portal del cliente — separado de "Por hacer" para que el equipo pueda
  // distinguir "recién llegó, nadie la ha visto" de "ya la revisamos y
  // quedó en la cola". sortOrder negativo: queda antes que todo lo demás
  // sin tener que renumerar las columnas existentes.
  { code: "SIN_TRIAGE", label: "Sin triaje", color: "#9ca3af", sortOrder: -1, isFinal: false },
  { code: "TAREAS_RECURRENTES", label: "Tareas recurrentes", color: "#7f7f7f", sortOrder: 0, isFinal: false },
  { code: "POR_HACER", label: "Por hacer", color: "#16324a", sortOrder: 1, isFinal: false },
  { code: "EN_PAUSA", label: "En pausa", color: "#c97416", sortOrder: 2, isFinal: false, isOptional: true },
  { code: "EN_DESARROLLO", label: "En desarrollo", color: "#08a89f", sortOrder: 3, isFinal: false },
  // Espera respuesta del cliente (Gantt del portal): no genera alertas de SLA
  // (isOptional) y su duración se atribuye al cliente (waitsOnClient).
  { code: "EN_ESPERA_CLIENTE", label: "En espera del cliente", color: "#7c5cff", sortOrder: 4, isFinal: false, isOptional: true, waitsOnClient: true },
  { code: "EN_REVISION", label: "En revisión", color: "#e2532a", sortOrder: 4, isFinal: false },
  { code: "FINALIZADA", label: "Finalizada", color: "#0e9f6e", sortOrder: 5, isFinal: true },
];

export async function seedStatuses(client: PrismaClient = prisma) {
  for (const s of DEFAULT_STATUSES) {
    await client.status.upsert({
      where: { code: s.code },
      update: {},
      create: s,
    });
  }
}

if (require.main === module) {
  seedStatuses()
    .then(() => {
      console.log("estados sembrados:", DEFAULT_STATUSES.map((s) => s.code).join(", "));
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
