// Herramientas del asistente IA (fusión Codia Task, fase A — solo
// lectura). El modelo nunca muta datos directo: busca/lee tareas y
// propone filtros o navegación como sugerencias que el usuario elige
// abrir. Mutaciones (crear/eliminar tarea vía flujo guiado) quedan para
// una fase B aparte — Codia Task guarda el estado de esa conversación
// paso a paso en memoria del proceso, que no sirve en Vercel serverless
// y hay que resolver antes de portarlo.
import { z } from "zod";
import { tool } from "ai";
import { prisma } from "@/lib/db";
import { requestVisibilityWhere, canViewRequest } from "@/lib/authz";
import { getStatuses } from "@/lib/statuses";
import { daysFromToday } from "@/lib/dates";

type ToolUser = { id: string; role: string };

export function buildTools(user: ToolUser) {
  return {
    searchTasks: tool({
      description:
        "Busca solicitudes/tareas por texto (título, folio o descripción), filtrando opcionalmente por estado o por 'solo las mías'. Devuelve como máximo 15 resultados. Úsala primero cuando el usuario pregunte por sus tareas o busque algo específico.",
      inputSchema: z.object({
        texto: z
          .string()
          .optional()
          .describe("Texto libre a buscar en título/folio/descripción"),
        soloMias: z
          .boolean()
          .optional()
          .describe("true = solo tareas asignadas al usuario que está preguntando"),
        estadoCodigo: z
          .string()
          .optional()
          .describe("Código exacto de estado (ver la lista de estados disponibles en tus instrucciones)"),
      }),
      execute: async ({ texto, soloMias, estadoCodigo }) => {
        const where = {
          ...requestVisibilityWhere(user),
          archivedAt: null,
          ...(soloMias ? { assigneeId: user.id } : {}),
          ...(estadoCodigo ? { status: estadoCodigo } : {}),
          ...(texto
            ? {
                OR: [
                  { title: { contains: texto, mode: "insensitive" as const } },
                  { key: { contains: texto, mode: "insensitive" as const } },
                  { description: { contains: texto, mode: "insensitive" as const } },
                ],
              }
            : {}),
        };
        const rows = await prisma.request.findMany({
          where,
          select: {
            key: true,
            title: true,
            status: true,
            dueDate: true,
            client: { select: { name: true } },
            assignee: { select: { name: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 15,
        });
        return {
          total: rows.length,
          tareas: rows.map((r) => ({
            folio: r.key,
            titulo: r.title,
            cliente: r.client.name,
            estado: r.status,
            responsable: r.assignee?.name ?? "Sin asignar",
            diasParaVencer: r.dueDate ? daysFromToday(r.dueDate) : null,
          })),
        };
      },
    }),

    getTaskDetail: tool({
      description: "Trae el detalle completo de una tarea/solicitud por su folio (ej. MBA-123).",
      inputSchema: z.object({
        folio: z.string().describe("Folio exacto, ej. MBA-123"),
      }),
      execute: async ({ folio }) => {
        const req = await prisma.request.findUnique({
          where: { key: folio },
          include: {
            client: true,
            assignee: true,
            collaborators: { include: { user: true } },
            timeEntries: { select: { hours: true } },
            comments: { select: { id: true } },
          },
        });
        if (!req || !canViewRequest(user, req)) {
          return { encontrada: false };
        }
        return {
          encontrada: true,
          folio: req.key,
          titulo: req.title,
          descripcion: req.description,
          cliente: req.client.name,
          estado: req.status,
          prioridad: req.priority,
          responsable: req.assignee?.name ?? "Sin asignar",
          colaboradores: req.collaborators.map((c) => c.user.name),
          fechaLimite: req.dueDate,
          horasCargadas: req.timeEntries.reduce((a, t) => a + t.hours, 0),
          cantidadComentarios: req.comments.length,
        };
      },
    }),

    proposeNavigate: tool({
      description:
        "Propone abrir una tarea específica en la plataforma. Úsala cuando el usuario quiera ver el detalle de una tarea puntual.",
      inputSchema: z.object({
        folio: z.string(),
        etiqueta: z.string().describe("Texto corto para el botón, ej. 'Abrir MBA-123'"),
      }),
      execute: async ({ folio, etiqueta }) => ({
        url: `/solicitudes/${folio}`,
        etiqueta,
      }),
    }),

    proposeBoardFilter: tool({
      description:
        "Propone abrir el listado de solicitudes con un filtro aplicado (por estado y/o por 'solo asignadas a mí'). Úsala cuando el usuario quiera ver una lista completa, no una tarea puntual.",
      inputSchema: z.object({
        estadoCodigo: z.string().optional(),
        soloMias: z.boolean().optional(),
        etiqueta: z.string().describe("Texto corto para el botón, ej. 'Ver en revisión'"),
      }),
      execute: async ({ estadoCodigo, soloMias, etiqueta }) => {
        const params = new URLSearchParams();
        if (estadoCodigo) params.set("estado", estadoCodigo);
        if (soloMias) params.set("responsable", user.id);
        return { url: `/solicitudes?${params.toString()}`, etiqueta };
      },
    }),

    rememberNote: tool({
      description:
        "Guarda una nota corta y útil para recordar en futuras conversaciones (preferencias del usuario, contexto recurrente). Úsala solo cuando el usuario diga algo que claramente conviene recordar — no para cada mensaje.",
      inputSchema: z.object({
        nota: z.string().max(300),
      }),
      execute: async ({ nota }) => {
        await prisma.aiMemoryNote.create({ data: { userId: user.id, content: nota } });
        return { guardada: true };
      },
    }),
  };
}

export async function systemPromptFor(user: ToolUser & { name: string }) {
  const [statuses, notes] = await Promise.all([
    getStatuses(),
    prisma.aiMemoryNote.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { content: true },
    }),
  ]);

  const statusList = statuses
    .map((s) => `${s.code} (${s.label}${s.isFinal ? ", estado final" : ""})`)
    .join(", ");

  const memoryBlock =
    notes.length > 0
      ? `\n\nNotas recordadas de conversaciones anteriores con este usuario:\n${notes.map((n) => `- ${n.content}`).join("\n")}`
      : "";

  return `Eres el asistente de RGC (Revo Gestión de Clientes), la plataforma interna de gestión de tareas y clientes de la agencia. Ayudas a ${user.name} a encontrar y entender sus solicitudes/tareas.

Reglas importantes:
- Eres de SOLO LECTURA. No puedes crear, editar ni eliminar nada — solo buscar información y proponer que el usuario abra un link dentro de la plataforma. Si te piden crear/editar/eliminar algo, explica amablemente que todavía no puedes hacer eso y sugiere hacerlo directo en la plataforma.
- Cuando encuentres tareas relevantes, usa proposeNavigate o proposeBoardFilter para ofrecer un atajo, no solo texto.
- Responde en español de Chile, breve y directo, sin relleno.
- Los códigos de estado válidos son: ${statusList}.${memoryBlock}`;
}
