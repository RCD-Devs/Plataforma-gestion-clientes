import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedStatuses } from "../scripts/seed-statuses";
import { seedRequestCounter } from "../scripts/seed-request-counter";

const prisma = new PrismaClient();

const DAY = 86400000;
const now = Date.now();
const ago = (d: number) => new Date(now - d * DAY);
const ahead = (d: number) => new Date(now + d * DAY);

// Contraseña demo compartida — todos los usuarios sembrados quedan con
// mustChangePassword: true, así que es solo para el primer ingreso.
const DEMO_PASSWORD = "Revo1234!";

async function main() {
  await seedStatuses(prisma);

  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log("Seed omitido: la base ya tiene usuarios.");
    return;
  }

  // Limpieza (respetando llaves foráneas)
  await prisma.timeEntry.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.request.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
  await prisma.client.deleteMany();

  const demoPasswordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // --- Equipos ---
  const tCuentas = await prisma.team.create({
    data: { name: "Cuentas", color: "#08a89f" },
  });
  const tDesarrollo = await prisma.team.create({
    data: { name: "Desarrollo", color: "#16324a" },
  });
  const tDiseno = await prisma.team.create({
    data: { name: "Diseño / UX", color: "#e2532a" },
  });
  const tSeo = await prisma.team.create({
    data: { name: "SEO", color: "#0e9f6e" },
  });

  // --- Usuarios (equipo) ---
  const jose = await prisma.user.create({
    data: {
      name: "José Luis Fuentes",
      email: "speedboat@rompecabeza.cl",
      passwordHash: demoPasswordHash,
      role: "LIDER_AREA",
      color: "#08a89f",
      teamId: tCuentas.id,
    },
  });
  const camila = await prisma.user.create({
    data: {
      name: "Camila Araya",
      email: "camila@rompecabeza.cl",
      passwordHash: demoPasswordHash,
      role: "COORDINADOR_CUENTA",
      color: "#16324a",
      teamId: tCuentas.id,
    },
  });
  const matias = await prisma.user.create({
    data: {
      name: "Matías Vera",
      email: "matias@rompecabeza.cl",
      passwordHash: demoPasswordHash,
      role: "DESARROLLADOR",
      color: "#fb693b",
      teamId: tDesarrollo.id,
    },
  });
  const nicolas = await prisma.user.create({
    data: {
      name: "Nicolás Vidal",
      email: "nicolas@rompecabeza.cl",
      passwordHash: demoPasswordHash,
      role: "DESARROLLADOR",
      color: "#146a8f",
      teamId: tDesarrollo.id,
    },
  });
  const valentina = await prisma.user.create({
    data: {
      name: "Valentina Rojas",
      email: "valentina@rompecabeza.cl",
      passwordHash: demoPasswordHash,
      role: "DISENADOR_UXUI",
      color: "#e2532a",
      teamId: tDiseno.id,
    },
  });
  const diego = await prisma.user.create({
    data: {
      name: "Diego Soto",
      email: "diego@rompecabeza.cl",
      passwordHash: demoPasswordHash,
      role: "SEO",
      color: "#0e9f6e",
      teamId: tSeo.id,
    },
  });

  const team = { jose, camila, matias, nicolas, valentina, diego };

  // --- Clientes ---
  const clientsData = [
    { name: "ACHS", code: "ACHS", email: "contacto@achs.cl", hours: 200, color: "#e2532a" },
    { name: "Habitat", code: "HAB", email: "marketing@habitat.cl", hours: 160, color: "#c97416" },
    { name: "VRAEA", code: "VRAEA", email: "comunicaciones@vraea.cl", hours: 120, color: "#16324a" },
    { name: "AIEP", code: "AIEP", email: "marketing@aiep.cl", hours: 100, color: "#08a89f" },
    { name: "Cristalchile", code: "CRISTAL", email: "contacto@cristalchile.cl", hours: 80, color: "#0e9f6e" },
    { name: "Prudential", code: "PRU", email: "marketing@prudential.cl", hours: 90, color: "#146a8f" },
    { name: "Smart CFO", code: "SCFO", email: "hola@smartcfo.cl", hours: 40, color: "#0bdbcf" },
    { name: "JBS", code: "JBS", email: "contacto@jbs.cl", hours: 60, color: "#fb693b" },
    { name: "NCA", code: "NCA", email: "contacto@nca.cl", hours: 30, color: "#08a89f" },
    { name: "SCH", code: "SCH", email: "contacto@sch.cl", hours: 0, color: "#7f7f7f" },
    { name: "Oxentia", code: "OXENTIA", email: "hola@oxentia.cl", hours: 0, color: "#fda565" },
  ];
  // Clientes a cargo de camila (COORDINADOR_CUENTA) — para poder probar la
  // visibilidad acotada de Rec. #22 con datos reales del seed.
  const camilaClients = ["ACHS", "HAB", "VRAEA"];

  const clients: Record<string, { id: string; email: string }> = {};
  for (const c of clientsData) {
    const created = await prisma.client.create({
      data: {
        name: c.name,
        code: c.code,
        contactEmail: c.email,
        contractedHours: c.hours,
        color: c.color,
        accountManagerId: camilaClients.includes(c.code) ? camila.id : null,
      },
    });
    clients[c.code] = { id: created.id, email: c.email };
    // Usuario-cliente para el portal (login con contraseña) — hasta que
    // exista la pantalla de administración (Fase 1), el alta de clientes
    // nuevos pasa por aquí o directo en la base.
    await prisma.user.create({
      data: {
        name: c.name,
        email: c.email,
        role: "CLIENTE",
        color: c.color,
        clientId: created.id,
        passwordHash: demoPasswordHash,
      },
    });
  }

  // --- Solicitudes (recreadas del tablero de Jira) ---
  type R = {
    key: string;
    title: string;
    client: string;
    type: string;
    status: string;
    priority: string;
    assignee: keyof typeof team;
    createdAgo: number;
    due?: number;
    clientPriority?: number;
    // Días entre ingreso y finalización (solo FINALIZADA) — alimenta el
    // cálculo de SLA del reporte por cliente.
    sla?: number;
  };
  const requests: R[] = [
    // Tareas recurrentes
    { key: "MBA-147", title: "Backup semanales del sitio", client: "VRAEA", type: "Desarrollo", status: "TAREAS_RECURRENTES", priority: "MEDIA", assignee: "matias", createdAgo: 120 },
    { key: "MBA-148", title: "Ofertas laborales", client: "VRAEA", type: "Contenido", status: "TAREAS_RECURRENTES", priority: "BAJA", assignee: "camila", createdAgo: 118 },
    { key: "MBA-217", title: "Fotos mensuales", client: "HAB", type: "Diseño UX/UI", status: "TAREAS_RECURRENTES", priority: "MEDIA", assignee: "valentina", createdAgo: 90 },
    { key: "MBA-301", title: "Desarrollo nuevas landing de especialidades", client: "ACHS", type: "Desarrollo", status: "TAREAS_RECURRENTES", priority: "ALTA", assignee: "matias", createdAgo: 60, clientPriority: 5 },
    { key: "MBA-329", title: "Pedidos Notion desarrollo", client: "ACHS", type: "Desarrollo", status: "TAREAS_RECURRENTES", priority: "MEDIA", assignee: "nicolas", createdAgo: 45 },

    // Por hacer
    { key: "MBA-656", title: "Configuración Google Analytics", client: "SCH", type: "Analítica", status: "POR_HACER", priority: "MEDIA", assignee: "diego", createdAgo: 10 },
    { key: "MBA-657", title: "Configuración Google Analytics", client: "NCA", type: "Analítica", status: "POR_HACER", priority: "MEDIA", assignee: "diego", createdAgo: 9 },
    { key: "MBA-804", title: "Mejorar rendimiento del sitio (desktop y mobile)", client: "VRAEA", type: "Desarrollo", status: "POR_HACER", priority: "ALTA", assignee: "matias", createdAgo: 7, due: 12, clientPriority: 4 },
    { key: "MBA-878", title: "Actualizar ambiente con producción", client: "VRAEA", type: "Bug / Corrección", status: "POR_HACER", priority: "URGENTE", assignee: "nicolas", createdAgo: 5, due: 3 },
    { key: "MBA-661", title: "Landing 'About us' — sección trusted by", client: "OXENTIA", type: "Diseño UX/UI", status: "POR_HACER", priority: "MEDIA", assignee: "valentina", createdAgo: 6 },

    // En pausa
    { key: "MBA-28", title: "Revisión de vulnerabilidades", client: "HAB", type: "Bug / Corrección", status: "EN_PAUSA", priority: "ALTA", assignee: "nicolas", createdAgo: 40 },
    { key: "MBA-558", title: "Rediseño sitio inversionistas", client: "HAB", type: "Diseño UX/UI", status: "EN_PAUSA", priority: "MEDIA", assignee: "valentina", createdAgo: 30 },
    { key: "MBA-954", title: "Formulario para campañas", client: "PRU", type: "Desarrollo", status: "EN_PAUSA", priority: "MEDIA", assignee: "matias", createdAgo: 20 },
    { key: "MBA-297", title: "Rediseño / replicar a sitio público", client: "HAB", type: "Diseño UX/UI", status: "EN_PAUSA", priority: "BAJA", assignee: "valentina", createdAgo: 25 },

    // En desarrollo
    { key: "MBA-41", title: "Cosmetología — AB testing", client: "AIEP", type: "Desarrollo", status: "EN_DESARROLLO", priority: "MEDIA", assignee: "matias", createdAgo: 15, clientPriority: 3 },
    { key: "MBA-42", title: "Parvularia — AB testing", client: "AIEP", type: "Desarrollo", status: "EN_DESARROLLO", priority: "MEDIA", assignee: "nicolas", createdAgo: 15 },
    { key: "MBA-287", title: "Carga capítulos 'El ring de las ventas'", client: "SCFO", type: "Contenido", status: "EN_DESARROLLO", priority: "MEDIA", assignee: "camila", createdAgo: 12 },
    { key: "MBA-641", title: "Revisión de textos", client: "SCFO", type: "SEO", status: "EN_DESARROLLO", priority: "MEDIA", assignee: "diego", createdAgo: 8 },
    { key: "MBA-990", title: "Análisis Clarity y GA — Clínica portada", client: "ACHS", type: "Analítica", status: "EN_DESARROLLO", priority: "ALTA", assignee: "diego", createdAgo: 4, clientPriority: 5 },

    // En revisión
    { key: "MBA-983", title: "Integración Salesforce", client: "CRISTAL", type: "Desarrollo", status: "EN_REVISION", priority: "ALTA", assignee: "matias", createdAgo: 18, due: 5 },
    { key: "MBA-953", title: "Refresh landing 'razones para elegir Habitat'", client: "HAB", type: "Diseño UX/UI", status: "EN_REVISION", priority: "MEDIA", assignee: "valentina", createdAgo: 14 },
    { key: "MBA-628", title: "Desarrollo simulador", client: "PRU", type: "Desarrollo", status: "EN_REVISION", priority: "ALTA", assignee: "nicolas", createdAgo: 22, clientPriority: 4 },
    { key: "MBA-875", title: "Refresh landing reportes y riesgos financieros", client: "HAB", type: "SEO", status: "EN_REVISION", priority: "MEDIA", assignee: "diego", createdAgo: 16 },

    // Finalizadas
    { key: "MBA-951", title: "WordPress autoadministrable", client: "JBS", type: "Desarrollo", status: "FINALIZADA", priority: "MEDIA", assignee: "matias", createdAgo: 35, sla: 6 },
    { key: "MBA-939", title: "Historia — caja negra de texto arriba a la derecha", client: "CRISTAL", type: "Diseño UX/UI", status: "FINALIZADA", priority: "BAJA", assignee: "valentina", createdAgo: 33, sla: 2 },
    { key: "MBA-916", title: "Modificaciones landing sostenibilidad", client: "CRISTAL", type: "Desarrollo", status: "FINALIZADA", priority: "MEDIA", assignee: "nicolas", createdAgo: 38, sla: 5 },
    { key: "MBA-740", title: "Botones flotantes", client: "HAB", type: "Diseño UX/UI", status: "FINALIZADA", priority: "BAJA", assignee: "valentina", createdAgo: 50, sla: 3 },

    // Finalizadas ACHS — histórico de 7 meses para el reporte SLA del cliente
    { key: "MBA-1001", title: "Actualización ficha médica — especialidad kinesiología", client: "ACHS", type: "Desarrollo", status: "FINALIZADA", priority: "MEDIA", assignee: "matias", createdAgo: 205, sla: 3 },
    { key: "MBA-1002", title: "Banner campaña vacunación influenza", client: "ACHS", type: "Diseño UX/UI", status: "FINALIZADA", priority: "ALTA", assignee: "valentina", createdAgo: 198, sla: 2 },
    { key: "MBA-1003", title: "Optimización SEO landing urgencias", client: "ACHS", type: "SEO", status: "FINALIZADA", priority: "MEDIA", assignee: "diego", createdAgo: 190, sla: 6 },
    { key: "MBA-1004", title: "Corrección formulario de contacto", client: "ACHS", type: "Bug / Corrección", status: "FINALIZADA", priority: "URGENTE", assignee: "nicolas", createdAgo: 185, sla: 1 },
    { key: "MBA-1005", title: "Reporte analítica trimestral Q2", client: "ACHS", type: "Analítica", status: "FINALIZADA", priority: "MEDIA", assignee: "diego", createdAgo: 175, sla: 4 },
    { key: "MBA-1023", title: "Rediseño completo ficha clínica", client: "ACHS", type: "Desarrollo", status: "FINALIZADA", priority: "ALTA", assignee: "matias", createdAgo: 160, sla: 18 },
    { key: "MBA-1006", title: "Landing especialidad oftalmología", client: "ACHS", type: "Desarrollo", status: "FINALIZADA", priority: "ALTA", assignee: "matias", createdAgo: 165, sla: 9 },
    { key: "MBA-1007", title: "Rediseño íconos especialidades", client: "ACHS", type: "Diseño UX/UI", status: "FINALIZADA", priority: "BAJA", assignee: "valentina", createdAgo: 150, sla: 3 },
    { key: "MBA-1008", title: "Contenido blog salud preventiva", client: "ACHS", type: "Contenido", status: "FINALIZADA", priority: "MEDIA", assignee: "camila", createdAgo: 140, sla: 5 },
    { key: "MBA-1009", title: "Migración certificados SSL", client: "ACHS", type: "Bug / Corrección", status: "FINALIZADA", priority: "URGENTE", assignee: "nicolas", createdAgo: 130, sla: 12 },
    { key: "MBA-1010", title: "Landing especialidad dermatología", client: "ACHS", type: "Desarrollo", status: "FINALIZADA", priority: "MEDIA", assignee: "matias", createdAgo: 120, sla: 4 },
    { key: "MBA-1011", title: "SEO on-page fichas médicos", client: "ACHS", type: "SEO", status: "FINALIZADA", priority: "MEDIA", assignee: "diego", createdAgo: 110, sla: 7 },
    { key: "MBA-1012", title: "Banner Día de la Salud Mental", client: "ACHS", type: "Diseño UX/UI", status: "FINALIZADA", priority: "MEDIA", assignee: "valentina", createdAgo: 100, sla: 2 },
    { key: "MBA-1013", title: "Actualización políticas de privacidad", client: "ACHS", type: "Contenido", status: "FINALIZADA", priority: "BAJA", assignee: "camila", createdAgo: 90, sla: 3 },
    { key: "MBA-1014", title: "Bug crítico formulario de agendamiento", client: "ACHS", type: "Bug / Corrección", status: "FINALIZADA", priority: "URGENTE", assignee: "nicolas", createdAgo: 80, sla: 15 },
    { key: "MBA-1015", title: "Landing especialidad traumatología", client: "ACHS", type: "Desarrollo", status: "FINALIZADA", priority: "ALTA", assignee: "matias", createdAgo: 70, sla: 6 },
    { key: "MBA-1016", title: "Reporte analítica mensual mayo", client: "ACHS", type: "Analítica", status: "FINALIZADA", priority: "MEDIA", assignee: "diego", createdAgo: 60, sla: 3 },
    { key: "MBA-1017", title: "Rediseño footer sitio principal", client: "ACHS", type: "Diseño UX/UI", status: "FINALIZADA", priority: "BAJA", assignee: "valentina", createdAgo: 50, sla: 4 },
    { key: "MBA-1018", title: "SEO técnico — velocidad de carga", client: "ACHS", type: "SEO", status: "FINALIZADA", priority: "ALTA", assignee: "diego", createdAgo: 42, sla: 8 },
    { key: "MBA-1019", title: "Contenido newsletter junio", client: "ACHS", type: "Contenido", status: "FINALIZADA", priority: "MEDIA", assignee: "camila", createdAgo: 35, sla: 2 },
    { key: "MBA-1020", title: "Landing especialidad cardiología norte", client: "ACHS", type: "Desarrollo", status: "FINALIZADA", priority: "MEDIA", assignee: "matias", createdAgo: 28, sla: 5 },
    { key: "MBA-1021", title: "Corrección enlaces rotos", client: "ACHS", type: "Bug / Corrección", status: "FINALIZADA", priority: "MEDIA", assignee: "nicolas", createdAgo: 20, sla: 1 },
    { key: "MBA-1022", title: "Reporte analítica mensual junio", client: "ACHS", type: "Analítica", status: "FINALIZADA", priority: "MEDIA", assignee: "diego", createdAgo: 12, sla: 3 },
  ];

  const reqIdByKey: Record<string, string> = {};
  for (const r of requests) {
    const c = clients[r.client];
    const created = await prisma.request.create({
      data: {
        key: r.key,
        title: r.title,
        type: r.type,
        description: `Solicitud de ${r.client} — ${r.title}.\n\nDetalle enviado por el cliente a través del formulario.`,
        status: r.status,
        priority: r.priority,
        clientPriority: r.clientPriority ?? null,
        requesterEmail: c.email,
        clientId: c.id,
        assigneeId: team[r.assignee].id,
        teamId: team[r.assignee].teamId,
        createdAt: ago(r.createdAgo),
        dueDate: r.due ? ahead(r.due) : null,
        finalizedAt:
          r.status === "FINALIZADA" && r.sla != null
            ? ago(r.createdAgo - r.sla)
            : null,
      },
    });
    reqIdByKey[r.key] = created.id;
    await prisma.activity.create({
      data: {
        requestId: created.id,
        type: "created",
        message: "Creó la solicitud desde el formulario",
        actorName: c.email,
        createdAt: ago(r.createdAgo),
      },
    });
  }

  // --- Horas (timesheet) ---
  const timeData: {
    key: string;
    user: keyof typeof team;
    hours: number;
    daysAgo: number;
    note?: string;
  }[] = [
    { key: "MBA-301", user: "matias", hours: 8, daysAgo: 40, note: "Maquetado landing especialidad cardiología" },
    { key: "MBA-301", user: "matias", hours: 6, daysAgo: 20, note: "Landing traumatología" },
    { key: "MBA-301", user: "nicolas", hours: 5, daysAgo: 8, note: "Ajustes responsive" },
    { key: "MBA-329", user: "nicolas", hours: 4, daysAgo: 6 },
    { key: "MBA-990", user: "diego", hours: 3, daysAgo: 3, note: "Setup Clarity + eventos GA4" },
    { key: "MBA-990", user: "diego", hours: 2.5, daysAgo: 1, note: "Dashboard de portada" },
    { key: "MBA-804", user: "matias", hours: 4, daysAgo: 5, note: "Auditoría Lighthouse" },
    { key: "MBA-878", user: "nicolas", hours: 2, daysAgo: 2 },
    { key: "MBA-41", user: "matias", hours: 6, daysAgo: 10, note: "Variantes A/B cosmetología" },
    { key: "MBA-42", user: "nicolas", hours: 5, daysAgo: 9 },
    { key: "MBA-287", user: "camila", hours: 3, daysAgo: 11 },
    { key: "MBA-641", user: "diego", hours: 2, daysAgo: 7, note: "Revisión SEO on-page" },
    { key: "MBA-983", user: "matias", hours: 12, daysAgo: 14, note: "Conector Salesforce + mapping" },
    { key: "MBA-953", user: "valentina", hours: 7, daysAgo: 12, note: "Diseño refresh landing" },
    { key: "MBA-628", user: "nicolas", hours: 15, daysAgo: 18, note: "Lógica del simulador" },

    // Horas del histórico ACHS (para el reporte SLA / horas por mes)
    { key: "MBA-1001", user: "matias", hours: 4, daysAgo: 203 },
    { key: "MBA-1002", user: "valentina", hours: 3, daysAgo: 197 },
    { key: "MBA-1003", user: "diego", hours: 5, daysAgo: 187 },
    { key: "MBA-1003", user: "diego", hours: 3, daysAgo: 185 },
    { key: "MBA-1004", user: "nicolas", hours: 1.5, daysAgo: 184 },
    { key: "MBA-1005", user: "diego", hours: 4, daysAgo: 173 },
    { key: "MBA-1023", user: "matias", hours: 10, daysAgo: 155, note: "Levantamiento y arquitectura" },
    { key: "MBA-1023", user: "matias", hours: 12, daysAgo: 148, note: "Maquetado ficha clínica" },
    { key: "MBA-1023", user: "matias", hours: 6, daysAgo: 143, note: "QA y ajustes" },
    { key: "MBA-1006", user: "matias", hours: 8, daysAgo: 162 },
    { key: "MBA-1006", user: "matias", hours: 5, daysAgo: 158 },
    { key: "MBA-1007", user: "valentina", hours: 4, daysAgo: 148 },
    { key: "MBA-1008", user: "camila", hours: 3, daysAgo: 137 },
    { key: "MBA-1009", user: "nicolas", hours: 6, daysAgo: 126, note: "Renovación certificados" },
    { key: "MBA-1009", user: "nicolas", hours: 3, daysAgo: 120 },
    { key: "MBA-1010", user: "matias", hours: 5, daysAgo: 118 },
    { key: "MBA-1011", user: "diego", hours: 4, daysAgo: 107 },
    { key: "MBA-1011", user: "diego", hours: 3, daysAgo: 104 },
    { key: "MBA-1012", user: "valentina", hours: 3, daysAgo: 99 },
    { key: "MBA-1013", user: "camila", hours: 2, daysAgo: 88 },
    { key: "MBA-1014", user: "nicolas", hours: 8, daysAgo: 75, note: "Diagnóstico bug crítico" },
    { key: "MBA-1014", user: "nicolas", hours: 6, daysAgo: 70 },
    { key: "MBA-1014", user: "nicolas", hours: 4, daysAgo: 66 },
    { key: "MBA-1015", user: "matias", hours: 6, daysAgo: 67 },
    { key: "MBA-1015", user: "matias", hours: 4, daysAgo: 65 },
    { key: "MBA-1016", user: "diego", hours: 3, daysAgo: 58 },
    { key: "MBA-1017", user: "valentina", hours: 4, daysAgo: 48 },
    { key: "MBA-1018", user: "diego", hours: 5, daysAgo: 39 },
    { key: "MBA-1018", user: "diego", hours: 3, daysAgo: 36 },
    { key: "MBA-1019", user: "camila", hours: 2, daysAgo: 34 },
    { key: "MBA-1020", user: "matias", hours: 5, daysAgo: 26 },
    { key: "MBA-1020", user: "matias", hours: 3, daysAgo: 24 },
    { key: "MBA-1021", user: "nicolas", hours: 1, daysAgo: 19 },
    { key: "MBA-1022", user: "diego", hours: 3, daysAgo: 10 },
    { key: "MBA-875", user: "diego", hours: 4, daysAgo: 16 },
    { key: "MBA-951", user: "matias", hours: 20, daysAgo: 35, note: "Migración a WordPress" },
    { key: "MBA-916", user: "nicolas", hours: 9, daysAgo: 38 },
    { key: "MBA-740", user: "valentina", hours: 3, daysAgo: 50 },
    { key: "MBA-217", user: "valentina", hours: 2, daysAgo: 4, note: "Selección y edición de fotos" },
    { key: "MBA-558", user: "valentina", hours: 6, daysAgo: 28 },
  ];
  for (const t of timeData) {
    await prisma.timeEntry.create({
      data: {
        requestId: reqIdByKey[t.key],
        userId: team[t.user].id,
        hours: t.hours,
        note: t.note ?? null,
        date: ago(t.daysAgo),
      },
    });
  }

  // --- Adjuntos de ejemplo ---
  await prisma.attachment.create({
    data: {
      requestId: reqIdByKey["MBA-953"],
      kind: "url",
      name: "Diseño en Figma",
      url: "https://figma.com/file/ejemplo-habitat",
    },
  });
  await prisma.attachment.create({
    data: {
      requestId: reqIdByKey["MBA-983"],
      kind: "url",
      name: "Documentación API Salesforce",
      url: "https://developer.salesforce.com/docs",
    },
  });

  // --- Comentarios de ejemplo ---
  await prisma.comment.create({
    data: {
      requestId: reqIdByKey["MBA-804"],
      body: "¿Podemos priorizar la home? Es la página con más tráfico.",
      isClient: true,
      authorName: "VRAEA",
      createdAt: ago(4),
    },
  });
  await prisma.comment.create({
    data: {
      requestId: reqIdByKey["MBA-804"],
      body: "Sí, partimos por la home esta semana. Te aviso apenas tengamos la primera mejora.",
      isClient: false,
      authorId: matias.id,
      authorName: matias.name,
      createdAt: ago(3),
    },
  });
  await prisma.comment.create({
    data: {
      requestId: reqIdByKey["MBA-983"],
      body: "Dejé el conector en revisión, falta validar el mapeo de campos de contacto.",
      isClient: false,
      authorId: matias.id,
      authorName: matias.name,
      createdAt: ago(2),
    },
  });

  // --- Notificaciones (bitácora de correos) ---
  await prisma.notification.createMany({
    data: [
      {
        recipientEmail: clients["VRAEA"].email,
        requestId: reqIdByKey["MBA-804"],
        title: "Tu solicitud MBA-804 ahora está \"Por hacer\"",
        body: "El estado de tu solicitud \"Mejorar rendimiento del sitio\" cambió a \"Por hacer\".",
        channel: "email",
        createdAt: ago(7),
      },
      {
        recipientEmail: clients["CRISTAL"].email,
        requestId: reqIdByKey["MBA-983"],
        title: "Tu solicitud MBA-983 ahora está \"En revisión\"",
        body: "El estado de tu solicitud \"Integración Salesforce\" cambió a \"En revisión\".",
        channel: "email",
        createdAt: ago(2),
      },
    ],
  });

  const counts = {
    equipos: 4,
    usuarios: 6 + clientsData.length,
    clientes: clientsData.length,
    solicitudes: requests.length,
    horas: timeData.reduce((a, t) => a + t.hours, 0),
  };
  console.log("Seed listo:", counts);
}

main()
  // Después de main(), no adentro: necesita ver Request.key ya con las
  // solicitudes de ejemplo creadas (si la base era nueva) o ya con las
  // reales (si main() se saltó el seed por encontrar usuarios existentes).
  .then(() => seedRequestCounter(prisma))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
