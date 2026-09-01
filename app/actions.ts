"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, createSession, destroySession, redirectForRole } from "@/lib/session";
import {
  assertNewPasswordAllowed,
  rotateUserPassword,
  PasswordPolicyError,
} from "@/lib/password";
import { sendPasswordReset, sendWelcomeEmail } from "@/lib/email";
import { isTeamRole, isManager, canActOnRequest, TEAM_ROLES } from "@/lib/authz";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { storeUploadedFile } from "@/lib/attachments";
import crypto from "crypto";
import { notifyClient, notifyTeam } from "@/lib/email";
import { PRIORITY_MAP } from "@/lib/constants";
import { getStatusMap } from "@/lib/statuses";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Usado tanto por "olvidé mi contraseña" como por el alta de usuarios desde
// /admin — en ambos casos la persona necesita un link para definir/cambiar
// su contraseña.
async function issuePasswordResetToken(userId: string) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashResetToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });
  return rawToken;
}

// Un input type=date entrega "YYYY-MM-DD"; new Date() lo interpretaría como
// medianoche UTC (día anterior en Chile). Se fija mediodía local.
function parseLocalDate(s: string) {
  return new Date(`${s}T12:00:00`);
}

// Contador atómico (Rec. #65/#67) — antes escaneaba todas las solicitudes
// y calculaba el máximo en memoria, lo que dos creaciones concurrentes
// (formulario público, portal y equipo interno son caminos separados)
// podían leer al mismo tiempo y generar el mismo folio. El UPDATE/INSERT
// de Counter es atómico en Postgres: dos transacciones concurrentes nunca
// obtienen el mismo valor.
async function nextKey() {
  const counter = await prisma.counter.upsert({
    where: { id: "request_key" },
    create: { id: "request_key", value: 1 },
    update: { value: { increment: 1 } },
  });
  return `MBA-${counter.value}`;
}

// Rec. #66 — defensa adicional ante una colisión de Request.key (por
// ejemplo si alguna vez se inserta un folio a mano fuera del contador):
// reintenta con un folio nuevo en vez de fallar la creación completa.
async function withKeyRetry<T>(
  create: (key: string) => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    const key = await nextKey();
    try {
      return await create(key);
    } catch (err) {
      const isKeyCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("key");
      if (!isKeyCollision || i === attempts - 1) throw err;
    }
  }
  throw new Error("no se pudo generar un folio único");
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
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const target = String(formData.get("target") || "login"); // "login" | "portal"
  const failPath = target === "portal" ? "/portal" : "/login";
  if (!email || !password) redirect(`${failPath}?error=credenciales`);

  const ip = await clientIp();
  if (!rateLimit(`login:${ip}`, 10, 10 * 60 * 1000)) {
    redirect(`${failPath}?error=rate_limit`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !user.passwordHash) {
    await logAudit({ type: "login_failed", actorEmail: email, ip, detail: `target=${target}, motivo=usuario` });
    redirect(`${failPath}?error=credenciales`);
  }

  let valid = false;
  try {
    valid = await bcrypt.compare(password, user.passwordHash);
  } catch {
    valid = false;
  }
  if (!valid) {
    await logAudit({ type: "login_failed", actorId: user.id, actorEmail: email, ip, detail: `target=${target}, motivo=password` });
    redirect(`${failPath}?error=credenciales`);
  }

  // El portal solo es para usuarios-cliente; el login de equipo, al revés.
  const isClientUser = user.role === "CLIENTE";
  if (target === "portal" && !isClientUser) {
    await logAudit({ type: "login_failed", actorId: user.id, actorEmail: email, ip, detail: "target=portal, motivo=rol_no_cliente" });
    redirect(`${failPath}?error=credenciales`);
  }
  if (target === "login" && isClientUser) {
    await logAudit({ type: "login_failed", actorId: user.id, actorEmail: email, ip, detail: "target=login, motivo=rol_cliente" });
    redirect(`${failPath}?error=credenciales`);
  }

  await createSession(user.id);
  await logAudit({ type: "login_success", actorId: user.id, actorEmail: user.email, ip, detail: `target=${target}` });
  redirect(user.mustChangePassword ? "/cambiar-clave" : redirectForRole(user));
}

export async function logout() {
  const user = await getSessionUser();
  await destroySession();
  if (user) await logAudit({ type: "logout", actorId: user.id, actorEmail: user.email });
  redirect("/login");
}

export async function changePassword(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (newPassword !== confirmPassword) {
    redirect("/cambiar-clave?error=no_coincide");
  }

  let currentValid = false;
  try {
    currentValid = await bcrypt.compare(currentPassword, user.passwordHash || "");
  } catch {
    currentValid = false;
  }
  // Si es el primer acceso y aún no tiene contraseña propia, no exigimos
  // la "actual". Si ya tiene una, sí debe demostrar que la conoce.
  if (user.passwordHash && !currentValid) {
    redirect("/cambiar-clave?error=actual_incorrecta");
  }

  try {
    await assertNewPasswordAllowed(
      newPassword,
      user.passwordHash,
      user.previousPasswordHash,
    );
  } catch (err) {
    if (err instanceof PasswordPolicyError) {
      redirect(`/cambiar-clave?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await rotateUserPassword(user.id, newPassword, user.passwordHash);
  await logAudit({ type: "password_changed", actorId: user.id, actorEmail: user.email });
  redirect(redirectForRole(user));
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const target = String(formData.get("target") || "login");
  const okPath =
    target === "portal"
      ? "/portal?reset=enviado"
      : "/login?reset=enviado";
  if (!email) redirect(okPath);

  const ip = await clientIp();
  const allowed = rateLimit(`reset:${ip}`, 5, 10 * 60 * 1000);

  const user = allowed ? await prisma.user.findUnique({ where: { email } }) : null;
  await logAudit({
    type: "password_reset_requested",
    actorId: user?.id,
    actorEmail: email,
    ip,
    detail: !allowed ? "rate_limited" : user?.isActive ? "encontrado" : "no_encontrado",
  });
  if (user?.isActive) {
    const rawToken = await issuePasswordResetToken(user.id);
    await sendPasswordReset({
      to: user.email,
      name: user.name,
      resetUrl: `/restablecer-contrasena?token=${rawToken}`,
    });
  }
  // Siempre responde igual, exista o no el correo, para no filtrar cuentas.
  redirect(okPath);
}

export async function resetPassword(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const fail = (error: string) =>
    redirect(`/restablecer-contrasena?token=${encodeURIComponent(token)}&error=${encodeURIComponent(error)}`);

  if (!token) fail("El enlace de recuperación no es válido o ya expiró");
  if (password !== confirmPassword) fail("Las contraseñas no coinciden");

  const tokenHash = hashResetToken(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    fail("El enlace de recuperación no es válido o ya expiró");
    return;
  }

  try {
    await assertNewPasswordAllowed(
      password,
      record.user.passwordHash,
      record.user.previousPasswordHash,
    );
  } catch (err) {
    if (err instanceof PasswordPolicyError) {
      fail(err.message);
      return;
    }
    throw err;
  }

  await rotateUserPassword(record.userId, password, record.user.passwordHash);
  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  await logAudit({
    type: "password_reset_completed",
    actorId: record.userId,
    actorEmail: record.user.email,
  });
  const dest = record.user.role === "CLIENTE" ? "/portal" : "/login";
  redirect(`${dest}?reset=ok`);
}

export async function changeStatus(requestId: string, status: string) {
  const user = await getSessionUser();
  const statusMap = await getStatusMap();
  if (!user || !statusMap[status]) return;
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { client: true, collaborators: true },
  });
  if (!req || req.status === status) return;
  if (!canActOnRequest(user, req)) return;
  // finalizedAt marca el cierre real de la solicitud — es la fecha que se
  // usa para calcular el SLA (finalizedAt − createdAt) en el reporte del
  // cliente. Se limpia si la solicitud se reabre.
  await prisma.request.update({
    where: { id: requestId },
    data: {
      status,
      finalizedAt: statusMap[status]?.isFinal ? new Date() : null,
    },
  });
  const label = statusMap[status]?.label ?? status;
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
  const user = await getSessionUser();
  if (!user || !isManager(user.role)) return;
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
  const user = await getSessionUser();
  if (!user || !isManager(user.role) || !PRIORITY_MAP[priority]) return;
  const req = await prisma.request.update({
    where: { id: requestId },
    data: { priority },
  });
  refreshLists(req.key);
}

export async function updateRequestDetails(requestId: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user) return;
  const existing = await prisma.request.findUnique({
    where: { id: requestId },
    include: { client: true, collaborators: true },
  });
  if (!existing || !canActOnRequest(user, existing)) return;

  const title = String(formData.get("title") || "").trim();
  if (!title) return;
  const description = String(formData.get("description") || "");
  const type = String(formData.get("type") || existing.type).trim() || existing.type;
  const dueStr = String(formData.get("dueDate") || "");
  const projectIdRaw = String(formData.get("projectId") || "");
  let projectId: string | null = null;
  if (projectIdRaw) {
    const project = await prisma.project.findUnique({ where: { id: projectIdRaw } });
    if (project && project.clientId === existing.clientId) projectId = project.id;
  }

  const req = await prisma.request.update({
    where: { id: requestId },
    data: {
      title,
      description,
      type,
      dueDate: dueStr ? parseLocalDate(dueStr) : null,
      projectId,
    },
  });
  await prisma.activity.create({
    data: {
      requestId,
      type: "edited",
      message: "Editó los detalles de la solicitud",
      actorName: user.name,
    },
  });
  refreshLists(req.key);
}

export async function archiveRequest(requestId: string) {
  const user = await getSessionUser();
  if (!user) return;
  const existing = await prisma.request.findUnique({
    where: { id: requestId },
    include: { client: true, collaborators: true },
  });
  if (!existing || !canActOnRequest(user, existing)) return;

  const req = await prisma.request.update({
    where: { id: requestId },
    data: { archivedAt: new Date() },
  });
  await prisma.activity.create({
    data: {
      requestId,
      type: "archived",
      message: "Archivó la solicitud",
      actorName: user.name,
    },
  });
  refreshLists(req.key);
}

export async function unarchiveRequest(requestId: string) {
  const user = await getSessionUser();
  if (!user) return;
  const existing = await prisma.request.findUnique({
    where: { id: requestId },
    include: { client: true, collaborators: true },
  });
  if (!existing || !canActOnRequest(user, existing)) return;

  const req = await prisma.request.update({
    where: { id: requestId },
    data: { archivedAt: null },
  });
  await prisma.activity.create({
    data: {
      requestId,
      type: "unarchived",
      message: "Restauró la solicitud archivada",
      actorName: user.name,
    },
  });
  refreshLists(req.key);
}

// ---------- Motor de tareas: fusión con Codia Task, parte aditiva (2026-09-01) ----------

export async function createSubtask(parentId: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user) return;
  const parent = await prisma.request.findUnique({
    where: { id: parentId },
    include: { client: true, collaborators: true },
  });
  if (!parent || !canActOnRequest(user, parent)) return;

  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const sub = await withKeyRetry((key) =>
    prisma.request.create({
      data: {
        key,
        title,
        type: parent.type,
        clientId: parent.clientId,
        projectId: parent.projectId,
        parentId: parent.id,
        requesterEmail: parent.requesterEmail,
        status: "POR_HACER",
      },
    }),
  );
  await prisma.activity.create({
    data: {
      requestId: parent.id,
      type: "subtask_created",
      message: `Creó la subtarea "${title}" (${sub.key})`,
      actorName: user.name,
    },
  });
  refreshLists(parent.key);
  revalidatePath(`/solicitudes/${sub.key}`);
}

export async function addCollaborator(requestId: string, userId: string) {
  const user = await getSessionUser();
  if (!user || !userId) return;
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { client: true, collaborators: true },
  });
  if (!req || !canActOnRequest(user, req)) return;
  if (req.collaborators.some((c) => c.userId === userId)) return;

  const collaborator = await prisma.user.findUnique({ where: { id: userId } });
  if (!collaborator) return;
  await prisma.requestCollaborator.create({ data: { requestId, userId } });
  await prisma.activity.create({
    data: {
      requestId,
      type: "collaborator_added",
      message: `Agregó a ${collaborator.name} como colaborador`,
      actorName: user.name,
    },
  });
  refreshLists(req.key);
}

export async function removeCollaborator(requestId: string, userId: string) {
  const user = await getSessionUser();
  if (!user) return;
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { client: true, collaborators: true },
  });
  if (!req || !canActOnRequest(user, req)) return;

  await prisma.requestCollaborator.deleteMany({ where: { requestId, userId } });
  refreshLists(req.key);
}

export async function saveCustomFieldValues(requestId: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user) return;
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { client: true, collaborators: true },
  });
  if (!req || !canActOnRequest(user, req)) return;

  const fields = await prisma.customFieldDefinition.findMany({ where: { archivedAt: null } });
  for (const field of fields) {
    const key = `field_${field.id}`;
    if (field.type === "checkbox") {
      const value = formData.get(key) === "on" ? "true" : "false";
      await prisma.customFieldValue.upsert({
        where: { fieldId_requestId: { fieldId: field.id, requestId } },
        update: { value },
        create: { fieldId: field.id, requestId, value },
      });
      continue;
    }
    const value = String(formData.get(key) || "").trim();
    if (!value) {
      await prisma.customFieldValue.deleteMany({ where: { fieldId: field.id, requestId } });
    } else {
      await prisma.customFieldValue.upsert({
        where: { fieldId_requestId: { fieldId: field.id, requestId } },
        update: { value },
        create: { fieldId: field.id, requestId, value },
      });
    }
  }
  revalidatePath(`/solicitudes/${req.key}`);
}

export async function markCommentsRead(requestId: string) {
  const user = await getSessionUser();
  if (!user) return;
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { client: true, collaborators: true },
  });
  if (!req) return;
  const allowed =
    user.role === "CLIENTE"
      ? user.clientId === req.clientId
      : canActOnRequest(user, req);
  if (!allowed) return;

  await prisma.commentRead.upsert({
    where: { userId_requestId: { userId: user.id, requestId } },
    update: { readAt: new Date() },
    create: { userId: user.id, requestId },
  });
}

export async function createProject(clientId: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return;
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const project = await prisma.project.create({ data: { name, clientId } });
  await logAudit({
    type: "admin_project_created",
    actorId: user.id,
    actorEmail: user.email,
    detail: `projectId=${project.id}, clientId=${clientId}`,
  });
  revalidatePath(`/admin/clientes/${clientId}`);
}

export async function setProjectActive(projectId: string, isActive: boolean) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return;
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { archivedAt: isActive ? null : new Date() },
  });
  await logAudit({
    type: isActive ? "admin_project_reactivated" : "admin_project_archived",
    actorId: user.id,
    actorEmail: user.email,
    detail: `projectId=${projectId}`,
  });
  revalidatePath(`/admin/clientes/${project.clientId}`);
}

export async function createCustomField(formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/mi-espacio");
  const label = String(formData.get("label") || "").trim();
  const type = String(formData.get("type") || "text");
  if (!label) redirect("/admin/campos?error=nombre");

  const options =
    type === "select"
      ? String(formData.get("options") || "")
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : [];

  const field = await prisma.customFieldDefinition.create({
    data: { label, type, options },
  });
  await logAudit({
    type: "admin_custom_field_created",
    actorId: user.id,
    actorEmail: user.email,
    detail: `fieldId=${field.id}, label=${label}`,
  });
  revalidatePath("/admin/campos");
  redirect("/admin/campos");
}

export async function setCustomFieldActive(fieldId: string, isActive: boolean) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return;
  await prisma.customFieldDefinition.update({
    where: { id: fieldId },
    data: { archivedAt: isActive ? null : new Date() },
  });
  await logAudit({
    type: isActive ? "admin_custom_field_reactivated" : "admin_custom_field_archived",
    actorId: user.id,
    actorEmail: user.email,
    detail: `fieldId=${fieldId}`,
  });
  revalidatePath("/admin/campos");
}

function statusFormValues(formData: FormData, fallbackSortOrder: number) {
  const label = String(formData.get("label") || "").trim();
  const color = String(formData.get("color") || "#7f7f7f").trim();
  const isFinal = formData.get("isFinal") === "on";
  const sortOrderRaw = formData.get("sortOrder");
  const sortOrder =
    sortOrderRaw !== null && sortOrderRaw !== ""
      ? Number(sortOrderRaw)
      : fallbackSortOrder;
  return { label, color, isFinal, sortOrder };
}

export async function createStatus(formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/mi-espacio");

  const code = String(formData.get("code") || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const count = await prisma.status.count();
  const { label, color, isFinal, sortOrder } = statusFormValues(formData, count);
  if (!code || !label) redirect("/admin/estados?error=datos");

  const existing = await prisma.status.findUnique({ where: { code } });
  if (existing) redirect("/admin/estados?error=code_existente");

  const status = await prisma.status.create({
    data: { code, label, color, isFinal, sortOrder },
  });
  await logAudit({
    type: "admin_status_created",
    actorId: user.id,
    actorEmail: user.email,
    detail: `statusId=${status.id}, code=${status.code}`,
  });
  refreshLists();
  revalidatePath("/admin/estados");
  redirect("/admin/estados");
}

export async function updateStatus(statusId: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/mi-espacio");

  const { label, color, isFinal, sortOrder } = statusFormValues(formData, 0);
  if (!label) redirect("/admin/estados?error=datos");

  await prisma.status.update({
    where: { id: statusId },
    data: { label, color, isFinal, sortOrder },
  });
  await logAudit({
    type: "admin_status_updated",
    actorId: user.id,
    actorEmail: user.email,
    detail: `statusId=${statusId}`,
  });
  refreshLists();
  revalidatePath("/admin/estados");
  redirect("/admin/estados");
}

export async function setStatusActive(statusId: string, isActive: boolean) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return;
  await prisma.status.update({
    where: { id: statusId },
    data: { archivedAt: isActive ? null : new Date() },
  });
  await logAudit({
    type: isActive ? "admin_status_reactivated" : "admin_status_archived",
    actorId: user.id,
    actorEmail: user.email,
    detail: `statusId=${statusId}`,
  });
  refreshLists();
  revalidatePath("/admin/estados");
}

export async function logHours(formData: FormData) {
  const user = await getSessionUser();
  if (!user || !isTeamRole(user.role)) return;
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
  const user = await getSessionUser();
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
    if (!user || user.role !== "CLIENTE" || user.clientId !== req.clientId) return;
    authorName = user.email;
  } else {
    if (!user || !isTeamRole(user.role)) return;
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
  const user = await getSessionUser();
  const requestId = String(formData.get("requestId") || "");
  const name = String(formData.get("name") || "Enlace").trim();
  const url = String(formData.get("url") || "").trim();
  if (!requestId || !url) return;
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { client: true, collaborators: true },
  });
  if (!user || !req || !canActOnRequest(user, req)) return;
  await prisma.attachment.create({
    data: { requestId, kind: "url", name: name || url, url },
  });
  revalidatePath(`/solicitudes/${req.key}`);
}

export async function setClientPriority(requestId: string, value: number) {
  const user = await getSessionUser();
  const v = Math.round(value);
  if (!user || user.role !== "CLIENTE" || v < 1 || v > 5) return;
  const existing = await prisma.request.findUnique({
    where: { id: requestId },
    select: { clientId: true },
  });
  if (!existing || existing.clientId !== user.clientId) return;
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
  const user = await getSessionUser();
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
      include: { client: true, collaborators: true },
    }),
  ]);
  if (!to || !req) return;
  if (!canActOnRequest(user, req)) return;

  const statusMap = await getStatusMap();
  const statusChanges =
    newStatus !== "KEEP" &&
    !statusMap[newStatus]?.isFinal &&
    !!statusMap[newStatus] &&
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
    const label = statusMap[newStatus]?.label ?? newStatus;
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
  const user = await getSessionUser();
  if (!user || !isTeamRole(user.role)) return;
  await prisma.notification.updateMany({
    where: { recipientEmail: user.email, channel: "team", read: false },
    data: { read: true },
  });
  revalidatePath("/mi-espacio");
}

export async function submitRequest(formData: FormData) {
  // Honeypot: campo oculto que un humano nunca completa. Si viene lleno,
  // es un bot — se responde como si hubiera funcionado, sin crear nada,
  // para no revelar que fue detectado.
  const honeypot = String(formData.get("website") || "").trim();
  if (honeypot) redirect("/solicitar/gracias");

  const ip = await clientIp();
  if (!rateLimit(`solicitar:${ip}`, 5, 10 * 60 * 1000)) {
    redirect("/solicitar?error=rate_limit");
  }

  const clientId = String(formData.get("clientId") || "");
  const requesterEmail = String(formData.get("requesterEmail") || "").trim();
  const type = String(formData.get("type") || "Solicitud");
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const rawPriority = String(formData.get("priority") || "MEDIA");
  const priority = PRIORITY_MAP[rawPriority] ? rawPriority : "MEDIA";
  const dueStr = String(formData.get("dueDate") || "");
  if (!clientId || !requesterEmail || !title) return;

  const req = await withKeyRetry((key) =>
    prisma.request.create({
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
    }),
  );
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
// El login del portal usa la misma acción `login` (arriba) con
// target="portal"; logout usa la misma `logout`.

export async function submitClientRequest(formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "CLIENTE" || !user.client) redirect("/portal");
  const email = user.email;
  const client = user.client;

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

  const req = await withKeyRetry((key) =>
    prisma.request.create({
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
    }),
  );

  await storeUploadedFile(req.id, file);

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

// ---------- Administración: clientes, usuarios, equipos (Rec. #27-#30) ----------
// Todo restringido a ADMIN por ahora — ver docs/integracion-codiatask/03-decisiones.md
// (ADR-011): Líder de área/Coordinador ganan esto recién en la fusión con Codia Task.

function revalidateAdmin() {
  revalidatePath("/admin/clientes");
  revalidatePath("/clientes");
  revalidatePath("/bolsa");
  revalidatePath("/solicitar");
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/equipos");
  revalidatePath("/equipo");
}

export async function createClient(formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/mi-espacio");

  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/admin/clientes/nuevo?error=nombre");

  const client = await prisma.client.create({
    data: {
      name,
      code: String(formData.get("code") || "").trim() || null,
      contactEmail: String(formData.get("contactEmail") || "").trim() || null,
      contractedHours: Number(formData.get("contractedHours") || 0) || 0,
      cycleMonths: Math.max(1, Number(formData.get("cycleMonths") || 1) || 1),
      cycleStartDate: (() => {
        const s = String(formData.get("cycleStartDate") || "");
        return s ? parseLocalDate(s) : null;
      })(),
      color: String(formData.get("color") || "").trim() || null,
      accountManagerId: String(formData.get("accountManagerId") || "") || null,
      isActive: formData.get("isActive") === "on",
    },
  });
  await logAudit({
    type: "admin_client_created",
    actorId: user.id,
    actorEmail: user.email,
    detail: `clientId=${client.id}, name=${client.name}`,
  });
  revalidateAdmin();
  redirect("/admin/clientes");
}

export async function updateClient(id: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/mi-espacio");

  const name = String(formData.get("name") || "").trim();
  if (!name) redirect(`/admin/clientes/${id}?error=nombre`);

  await prisma.client.update({
    where: { id },
    data: {
      name,
      code: String(formData.get("code") || "").trim() || null,
      contactEmail: String(formData.get("contactEmail") || "").trim() || null,
      contractedHours: Number(formData.get("contractedHours") || 0) || 0,
      cycleMonths: Math.max(1, Number(formData.get("cycleMonths") || 1) || 1),
      cycleStartDate: (() => {
        const s = String(formData.get("cycleStartDate") || "");
        return s ? parseLocalDate(s) : null;
      })(),
      color: String(formData.get("color") || "").trim() || null,
      accountManagerId: String(formData.get("accountManagerId") || "") || null,
      isActive: formData.get("isActive") === "on",
    },
  });
  await logAudit({
    type: "admin_client_updated",
    actorId: user.id,
    actorEmail: user.email,
    detail: `clientId=${id}`,
  });
  revalidateAdmin();
  redirect("/admin/clientes");
}

export async function setClientActive(id: string, isActive: boolean) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return;
  await prisma.client.update({ where: { id }, data: { isActive } });
  await logAudit({
    type: isActive ? "admin_client_reactivated" : "admin_client_deactivated",
    actorId: user.id,
    actorEmail: user.email,
    detail: `clientId=${id}`,
  });
  revalidateAdmin();
}

export async function createHoursAdjustment(clientId: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/mi-espacio");

  const hours = Number(formData.get("hours") || 0);
  if (!hours) redirect(`/admin/clientes/${clientId}?error=ajuste_invalido`);

  await prisma.hoursAdjustment.create({
    data: {
      clientId,
      hours,
      note: String(formData.get("note") || "").trim() || null,
      actorId: user.id,
      actorName: user.name,
    },
  });
  await logAudit({
    type: "admin_hours_adjustment",
    actorId: user.id,
    actorEmail: user.email,
    detail: `clientId=${clientId}, hours=${hours}`,
  });
  revalidateAdmin();
  revalidatePath(`/admin/clientes/${clientId}`);
  redirect(`/admin/clientes/${clientId}`);
}

export async function createUser(formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/mi-espacio");

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "");
  const validRole = (TEAM_ROLES as readonly string[]).includes(role) || role === "CLIENTE";
  if (!name || !email || !validRole) redirect("/admin/usuarios/nuevo?error=datos");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect("/admin/usuarios/nuevo?error=email_existente");

  const isClientRole = role === "CLIENTE";
  const clientId = isClientRole ? String(formData.get("clientId") || "") || null : null;
  if (isClientRole && !clientId) redirect("/admin/usuarios/nuevo?error=cliente_requerido");

  const created = await prisma.user.create({
    data: {
      name,
      email,
      role,
      color: String(formData.get("color") || "").trim() || null,
      teamId: isTeamRole(role) ? String(formData.get("teamId") || "") || null : null,
      clientId,
      isActive: true,
      mustChangePassword: true,
    },
  });
  await logAudit({
    type: "admin_user_created",
    actorId: user.id,
    actorEmail: user.email,
    detail: `userId=${created.id}, email=${created.email}, role=${created.role}`,
  });

  const rawToken = await issuePasswordResetToken(created.id);
  await sendWelcomeEmail({
    to: created.email,
    name: created.name,
    resetUrl: `/restablecer-contrasena?token=${rawToken}`,
  });

  revalidateAdmin();
  redirect("/admin/usuarios");
}

export async function updateUser(id: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/mi-espacio");

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "");
  const validRole = (TEAM_ROLES as readonly string[]).includes(role) || role === "CLIENTE";
  if (!name || !email || !validRole) redirect(`/admin/usuarios/${id}?error=datos`);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== id) redirect(`/admin/usuarios/${id}?error=email_existente`);

  const isClientRole = role === "CLIENTE";
  const clientId = isClientRole ? String(formData.get("clientId") || "") || null : null;
  if (isClientRole && !clientId) redirect(`/admin/usuarios/${id}?error=cliente_requerido`);

  await prisma.user.update({
    where: { id },
    data: {
      name,
      email,
      role,
      color: String(formData.get("color") || "").trim() || null,
      teamId: isTeamRole(role) ? String(formData.get("teamId") || "") || null : null,
      clientId,
      isActive: formData.get("isActive") === "on",
    },
  });
  await logAudit({
    type: "admin_user_updated",
    actorId: user.id,
    actorEmail: user.email,
    detail: `userId=${id}`,
  });
  revalidateAdmin();
  redirect("/admin/usuarios");
}

export async function setUserActive(id: string, isActive: boolean) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return;
  await prisma.user.update({ where: { id }, data: { isActive } });
  await logAudit({
    type: isActive ? "admin_user_reactivated" : "admin_user_deactivated",
    actorId: user.id,
    actorEmail: user.email,
    detail: `userId=${id}`,
  });
  revalidateAdmin();
}

export async function createTeam(formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/mi-espacio");

  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/admin/equipos/nuevo?error=nombre");

  const memberIds = formData.getAll("memberIds").map(String).filter(Boolean);
  const team = await prisma.team.create({
    data: {
      name,
      color: String(formData.get("color") || "").trim() || null,
    },
  });
  if (memberIds.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: memberIds } },
      data: { teamId: team.id },
    });
  }
  await logAudit({
    type: "admin_team_created",
    actorId: user.id,
    actorEmail: user.email,
    detail: `teamId=${team.id}, name=${team.name}`,
  });
  revalidateAdmin();
  redirect("/admin/equipos");
}

export async function updateTeam(id: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/mi-espacio");

  const name = String(formData.get("name") || "").trim();
  if (!name) redirect(`/admin/equipos/${id}?error=nombre`);

  const memberIds = formData.getAll("memberIds").map(String).filter(Boolean);
  await prisma.team.update({
    where: { id },
    data: {
      name,
      color: String(formData.get("color") || "").trim() || null,
    },
  });
  // User.teamId es 1-a-muchos (sin tabla intermedia): se reconcilia
  // desasignando a quien se sacó y asignando a los seleccionados.
  await prisma.user.updateMany({
    where: { teamId: id, id: { notIn: memberIds } },
    data: { teamId: null },
  });
  if (memberIds.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: memberIds } },
      data: { teamId: id },
    });
  }
  await logAudit({
    type: "admin_team_updated",
    actorId: user.id,
    actorEmail: user.email,
    detail: `teamId=${id}`,
  });
  revalidateAdmin();
  redirect("/admin/equipos");
}

export async function deleteTeam(id: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return;
  const team = await prisma.team.findUnique({
    where: { id },
    include: { members: { select: { id: true } }, requests: { select: { id: true } } },
  });
  if (!team || team.members.length > 0 || team.requests.length > 0) return;
  await prisma.team.delete({ where: { id } });
  await logAudit({
    type: "admin_team_deleted",
    actorId: user.id,
    actorEmail: user.email,
    detail: `teamId=${id}, name=${team.name}`,
  });
  revalidateAdmin();
}
