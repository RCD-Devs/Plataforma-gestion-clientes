"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { findClientByEmail, getPortalSession } from "@/lib/portal";
import { notifyClient, notifyTeam } from "@/lib/email";
import { STATUS_MAP, PRIORITY_MAP } from "@/lib/constants";

// Un input type=date entrega "YYYY-MM-DD"; new Date() lo interpretaría como
// medianoche UTC (día anterior en Chile). Se fija mediodía local.
function parseLocalDate(s: string) {
  return new Date(`${s}T12:00:00`);
}

async function nextKey() {
  const reqs = await prisma.request.findMany({ select: { key: true } });
  let max = 0;
  for (const r of reqs) {
    const m = r.key.match(/(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `MBA-${max + 1}`;
}

// Destinatarios de alertas internas: el responsable, o los líderes de área
// si la tarea aún no tiene asignado (para que la alerta no se pierda).
async function teamAlertEmails(assigneeEmail?: string | null) {
  if (assigneeEmail) return [assigneeEmail];
  const leaders = await prisma.user.findMany({
    where: { role: { in: ["LIDER_AREA", "ADMIN"] } },
    select: { email: true },
  });
  return leaders.map((l) => l.email);
}

function refreshLists(key?: string) {
  revalidatePath("/tablero");
  revalidatePath("/solicitudes");
  revalidatePath("/dashboard");
  revalidatePath("/mi-espacio");
  revalidatePath("/equipo");
  if (key) revalidatePath(`/solicitudes/${key}`);
}

export async function login(formData: FormData) {
  const userId = String(formData.get("userId") || "");
  if (!userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const store = await cookies();
  store.set("revo_uid", userId, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(
    user?.role === "LIDER_AREA" || user?.role === "ADMIN"
      ? "/equipo"
      : "/mi-espacio",
  );
}

export async function logout() {
  const store = await cookies();
  store.delete("revo_uid");
  redirect("/login");
}

export async function changeStatus(requestId: string, status: string) {
  const user = await getCurrentUser();
  if (!user || !STATUS_MAP[status]) return;
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { client: true },
  });
  if (!req || req.status === status) return;
  // finalizedAt marca el cierre real de la solicitud — es la fecha que se
  // usa para calcular el SLA (finalizedAt − createdAt) en el reporte del
  // cliente. Se limpia si la solicitud se reabre.
  await prisma.request.update({
    where: { id: requestId },
    data: {
      status,
      finalizedAt: status === "FINALIZADA" ? new Date() : null,
    },
  });
  const label = STATUS_MAP[status]?.label ?? status;
  await prisma.activity.create({
    data: {
      requestId,
      type: "status_change",
      message: `Cambió el estado a "${label}"`,
      actorName: user?.name ?? "Sistema",
    },
  });
  if (req.requesterEmail) {
    await notifyClient({
      to: req.requesterEmail,
      requestId,
      title: `Tu solicitud ${req.key} ahora está "${label}"`,
      body: `El estado de tu solicitud "${req.title}" (${req.key}) para ${req.client.name} cambió a "${label}".`,
    });
  }
  refreshLists(req.key);
  revalidatePath("/portal");
}

export async function assignRequest(requestId: string, assigneeId: string) {
  const user = await getCurrentUser();
  if (!user) return;
  const assignee = assigneeId
    ? await prisma.user.findUnique({ where: { id: assigneeId } })
    : null;
  const req = await prisma.request.update({
    where: { id: requestId },
    data: {
      assigneeId: assigneeId || null,
      teamId: assignee?.teamId ?? undefined,
    },
  });
  await prisma.activity.create({
    data: {
      requestId,
      type: "assigned",
      message: assignee ? `Asignó a ${assignee.name}` : "Quitó la asignación",
      actorName: user?.name ?? "Sistema",
    },
  });
  refreshLists(req.key);
}

export async function updatePriority(requestId: string, priority: string) {
  const user = await getCurrentUser();
  if (!user || !PRIORITY_MAP[priority]) return;
  const req = await prisma.request.update({
    where: { id: requestId },
    data: { priority },
  });
  refreshLists(req.key);
}

export async function logHours(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const requestId = String(formData.get("requestId") || "");
  const hours = parseFloat(String(formData.get("hours") || "0"));
  const note = String(formData.get("note") || "");
  const dateStr = String(formData.get("date") || "");
  if (!requestId || !hours || hours <= 0) return;
  await prisma.timeEntry.create({
    data: {
      requestId,
      userId: user.id,
      hours,
      note: note || null,
      date: dateStr ? parseLocalDate(dateStr) : new Date(),
    },
  });
  const req = await prisma.request.findUnique({ where: { id: requestId } });
  await prisma.activity.create({
    data: {
      requestId,
      type: "time_logged",
      message: `Cargó ${hours} h${note ? ` — ${note}` : ""}`,
      actorName: user.name,
    },
  });
  if (req) revalidatePath(`/solicitudes/${req.key}`);
  revalidatePath("/bolsa");
  revalidatePath("/dashboard");
}

export async function addComment(formData: FormData) {
  const user = await getCurrentUser();
  const requestId = String(formData.get("requestId") || "");
  const body = String(formData.get("body") || "").trim();
  const isClient = String(formData.get("isClient") || "") === "1";
  if (!requestId || !body) return;
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { assignee: true, client: true },
  });
  if (!req) return;

  // El comentario de cliente exige sesión de portal dueña de la solicitud
  // (evita comentar o suplantar en solicitudes de otros clientes); el de
  // equipo exige sesión interna. El autor sale de la sesión, no del form.
  let authorName: string;
  if (isClient) {
    const portal = await getPortalSession();
    if (!portal || portal.client.id !== req.clientId) return;
    authorName = portal.email;
  } else {
    if (!user) return;
    authorName = user.name;
  }

  await prisma.comment.create({
    data: {
      requestId,
      body,
      isClient,
      authorId: isClient ? null : user!.id,
      authorName,
    },
  });
  await prisma.activity.create({
    data: {
      requestId,
      type: "comment",
      message: "Agregó un comentario",
      actorName: authorName,
    },
  });
  if (!isClient && req?.requesterEmail) {
    await notifyClient({
      to: req.requesterEmail,
      requestId,
      title: `Nuevo comentario en ${req.key}`,
      body,
    });
  }
  if (isClient) {
    for (const to of await teamAlertEmails(req.assignee?.email)) {
      await notifyTeam({
        to,
        requestId,
        title: `Feedback del cliente en ${req.key}`,
        body: `${req.client.name} comentó en "${req.title}": ${body.slice(0, 140)}`,
      });
    }
  }
  if (req) {
    revalidatePath(`/solicitudes/${req.key}`);
    revalidatePath(`/portal/solicitud/${req.key}`);
  }
  revalidatePath("/portal");
}

export async function addUrlAttachment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const requestId = String(formData.get("requestId") || "");
  const name = String(formData.get("name") || "Enlace").trim();
  const url = String(formData.get("url") || "").trim();
  if (!requestId || !url) return;
  await prisma.attachment.create({
    data: { requestId, kind: "url", name: name || url, url },
  });
  const req = await prisma.request.findUnique({ where: { id: requestId } });
  if (req) revalidatePath(`/solicitudes/${req.key}`);
}

export async function setClientPriority(requestId: string, value: number) {
  const portal = await getPortalSession();
  const v = Math.round(value);
  if (!portal || v < 1 || v > 5) return;
  const existing = await prisma.request.findUnique({
    where: { id: requestId },
    select: { clientId: true },
  });
  if (!existing || existing.clientId !== portal.client.id) return;
  const req = await prisma.request.update({
    where: { id: requestId },
    data: { clientPriority: v },
    include: { assignee: true, client: true },
  });
  for (const to of await teamAlertEmails(req.assignee?.email)) {
    await notifyTeam({
      to,
      requestId,
      title: `${req.client.name} cambió la prioridad de ${req.key}`,
      body: `"${req.title}" ahora tiene prioridad ${v}/5 para el cliente.`,
    });
  }
  revalidatePath("/portal");
  revalidatePath(`/solicitudes/${req.key}`);
  revalidatePath("/solicitudes");
  revalidatePath("/mi-espacio");
}

// Traspaso de tarea entre perfiles (ej: diseño → desarrollo). Notifica al
// colaborador que la recibe; al cliente solo se le informa si además cambia
// el estado (nunca "Finalizada" desde aquí — eso ocurre al terminar de verdad).
export async function handoffRequest(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const requestId = String(formData.get("requestId") || "");
  const toUserId = String(formData.get("toUserId") || "");
  const note = String(formData.get("note") || "").trim();
  const newStatus = String(formData.get("newStatus") || "KEEP");
  if (!requestId || !toUserId) return;

  const [to, req] = await Promise.all([
    prisma.user.findUnique({ where: { id: toUserId } }),
    prisma.request.findUnique({
      where: { id: requestId },
      include: { client: true },
    }),
  ]);
  if (!to || !req) return;

  const statusChanges =
    newStatus !== "KEEP" &&
    newStatus !== "FINALIZADA" &&
    !!STATUS_MAP[newStatus] &&
    newStatus !== req.status;
  await prisma.request.update({
    where: { id: requestId },
    data: {
      assigneeId: to.id,
      teamId: to.teamId ?? undefined,
      ...(statusChanges ? { status: newStatus } : {}),
    },
  });
  await prisma.activity.create({
    data: {
      requestId,
      type: "handoff",
      message: `Envió la tarea a ${to.name}${note ? ` — ${note}` : ""}`,
      actorName: user.name,
    },
  });
  await notifyTeam({
    to: to.email,
    requestId,
    title: `${user.name} te envió la tarea ${req.key}`,
    body: `"${req.title}" (${req.client.name})${note ? ` — ${note}` : ""}`,
  });
  if (statusChanges && req.requesterEmail) {
    const label = STATUS_MAP[newStatus]?.label ?? newStatus;
    await notifyClient({
      to: req.requesterEmail,
      requestId,
      title: `Tu solicitud ${req.key} ahora está "${label}"`,
      body: `El estado de tu solicitud "${req.title}" (${req.key}) para ${req.client.name} cambió a "${label}".`,
    });
  }
  refreshLists(req.key);
  revalidatePath("/portal");
}

export async function markTeamAlertsRead() {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.notification.updateMany({
    where: { recipientEmail: user.email, channel: "team", read: false },
    data: { read: true },
  });
  revalidatePath("/mi-espacio");
}

export async function submitRequest(formData: FormData) {
  const clientId = String(formData.get("clientId") || "");
  const requesterEmail = String(formData.get("requesterEmail") || "").trim();
  const type = String(formData.get("type") || "Solicitud");
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const rawPriority = String(formData.get("priority") || "MEDIA");
  const priority = PRIORITY_MAP[rawPriority] ? rawPriority : "MEDIA";
  const dueStr = String(formData.get("dueDate") || "");
  if (!clientId || !requesterEmail || !title) return;

  const key = await nextKey();
  const req = await prisma.request.create({
    data: {
      key,
      title,
      type,
      description,
      priority,
      requesterEmail,
      clientId,
      status: "POR_HACER",
      dueDate: dueStr ? parseLocalDate(dueStr) : null,
    },
    include: { client: true },
  });
  await prisma.activity.create({
    data: {
      requestId: req.id,
      type: "created",
      message: "Creó la solicitud desde el formulario",
      actorName: requesterEmail,
    },
  });
  await notifyClient({
    to: requesterEmail,
    requestId: req.id,
    title: `Recibimos tu solicitud ${req.key}`,
    body: `Recibimos tu solicitud "${title}" para ${req.client.name}. Su folio es ${req.key} y su estado es "Por hacer". Te avisaremos por correo cada cambio de estado.`,
  });
  refreshLists();
  redirect(`/solicitar/gracias?key=${req.key}`);
}

// ── Portal del cliente ──────────────────────────────────────────

export async function portalLogin(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) redirect("/portal?error=invalido");
  const client = await findClientByEmail(email);
  if (!client) redirect(`/portal?error=desconocido&email=${encodeURIComponent(email)}`);
  const store = await cookies();
  store.set("revo_client_email", email, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/portal");
}

export async function portalLogout() {
  const store = await cookies();
  store.delete("revo_client_email");
  redirect("/portal");
}

export async function submitClientRequest(formData: FormData) {
  const session = await getPortalSession();
  if (!session) redirect("/portal");
  const { email, client } = session;

  const type = String(formData.get("type") || "Otro");
  const description = String(formData.get("description") || "").trim();
  const rawPriority = String(formData.get("priority") || "MEDIA");
  const priority = PRIORITY_MAP[rawPriority] ? rawPriority : "MEDIA";
  const dueStr = String(formData.get("dueDate") || "");
  const file = formData.get("file") as File | null;
  if (!description) redirect("/portal?error=descripcion");

  const firstLine = description.split("\n")[0];
  const title =
    firstLine.length > 70 ? `${firstLine.slice(0, 67).trimEnd()}…` : firstLine;

  const key = await nextKey();
  const req = await prisma.request.create({
    data: {
      key,
      title: `${type} — ${title}`,
      type,
      description,
      priority,
      requesterEmail: email,
      clientId: client.id,
      status: "POR_HACER",
      dueDate: dueStr ? parseLocalDate(dueStr) : null,
    },
  });

  if (file && file.size > 0) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const dir = path.join(process.cwd(), "uploads");
    await mkdir(dir, { recursive: true });
    const id = crypto.randomUUID();
    const ext = path.extname(file.name) || "";
    await writeFile(path.join(dir, id + ext), bytes);
    const mime = file.type || "";
    const kind = mime.includes("pdf")
      ? "pdf"
      : mime.includes("image")
        ? "png"
        : "file";
    await prisma.attachment.create({
      data: {
        requestId: req.id,
        kind,
        name: file.name,
        url: `/api/files/${id}${ext}`,
      },
    });
  }

  await prisma.activity.create({
    data: {
      requestId: req.id,
      type: "created",
      message: "Creó la solicitud desde el portal del cliente",
      actorName: email,
    },
  });
  await notifyClient({
    to: email,
    requestId: req.id,
    title: `Recibimos tu solicitud ${req.key}`,
    body: `Recibimos tu solicitud de ${type} para ${client.name}. Su folio es ${req.key} y su estado es "Por hacer". Te avisaremos por correo cada cambio de estado.`,
  });
  refreshLists();
  revalidatePath("/portal");
  redirect(`/portal?ok=${req.key}`);
}
