"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, createSession, destroySession, redirectForRole } from "@/lib/session";
import {
  assertNewPasswordAllowed,
  rotateUserPassword,
  PasswordPolicyError,
} from "@/lib/password";
import { hashResetToken, tokenRecordProblem } from "@/lib/reset-token";
import { sendPasswordReset, sendWelcomeEmail } from "@/lib/email";
import { isTeamRole, canActOnRequest } from "@/lib/authz";
import { hasAccess, canOnClient, ACTIONS, type ActionId, type Capabilities } from "@/lib/permissions";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { storeUploadedFile } from "@/lib/attachments";
import { deleteFromStorage } from "@/lib/storage";
import crypto from "crypto";
import { notifyClient, notifyTeam } from "@/lib/email";
import { PRIORITY_MAP } from "@/lib/constants";
import { getStatusMap } from "@/lib/statuses";
import { isValidEmail } from "@/lib/validate";
import { getPortalContext, canActAsClient, PORTAL_CLIENT_COOKIE } from "@/lib/portal";
import { stageDateIssue } from "@/lib/projectBudget";
import { parseLocalDate, zonedTimeToUtc } from "@/lib/dates";
import { overlapsOf } from "@/lib/scheduleBlocks";
import { uniqueSlug } from "@/lib/slug";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
// Invitaciones de usuarios nuevos: la persona puede tardar en abrir el correo.
const INVITE_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

// Usado tanto por "olvidé mi contraseña" como por el alta de usuarios desde
// /admin — en ambos casos la persona necesita un link para definir/cambiar
// su contraseña.
async function issuePasswordResetToken(userId: string, ttlMs = RESET_TOKEN_TTL_MS) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashResetToken(rawToken),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return rawToken;
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
  // Nuevo #3 — antes era role IN (LIDER_AREA, ADMIN); ahora es "quien
  // tenga team.view_load otorgado", data-driven en vez de nombres fijos.
  const leaders = await prisma.user.findMany({
    where: {
      roles: {
        some: {
          role: {
            archivedAt: null,
            permissions: { some: { action: "team.view_load", scope: "all" } },
          },
        },
      },
    },
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

  const user = await prisma.user.findUnique({
    where: { email },
    include: { roles: { select: { role: { select: { code: true } } } } },
  });
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
  const roleCodes = user.roles.map((r) => r.role.code);
  redirect(user.mustChangePassword ? "/cambiar-clave" : redirectForRole({ ...user, roleCodes }));
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

  if (!token) fail("Falta el enlace. Abre el enlace completo del correo.");
  if (password !== confirmPassword) fail("Las contraseñas no coinciden");

  const tokenHash = hashResetToken(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  const problem = tokenRecordProblem(record);
  if (!record || problem) {
    fail(problem ?? "Este enlace no es válido.");
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

// Rec. #90 — estos 4 controles (components/controls.tsx) son <select>/
// botones no controlados: si la acción falla en silencio, el elemento ya
// muestra visualmente el valor nuevo aunque la base no haya cambiado. El
// { ok } de retorno le permite a controls.tsx revertir el valor y avisar.
export async function changeStatus(
  requestId: string,
  status: string,
): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  const statusMap = await getStatusMap();
  if (!user || !statusMap[status]) return { ok: false };
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { client: true, collaborators: true },
  });
  if (!req || req.status === status) return { ok: false };
  if (!canActOnRequest(user, req)) return { ok: false };
  // finalizedAt marca el cierre real de la solicitud — es la fecha que se
  // usa para calcular el SLA (finalizedAt − createdAt) en el reporte del
  // cliente. Se limpia si la solicitud se reabre.
  await prisma.request.update({
    where: { id: requestId },
    data: {
      status,
      finalizedAt: statusMap[status]?.isFinal ? new Date() : null,
      statusChanges: { create: { status, actorName: user.name } },
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
  return { ok: true };
}

export async function assignRequest(
  requestId: string,
  assigneeId: string,
): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user || !hasAccess(user.capabilities, "requests.assign")) return { ok: false };
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
  return { ok: true };
}

export async function updatePriority(
  requestId: string,
  priority: string,
): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user || !hasAccess(user.capabilities, "requests.set_priority") || !PRIORITY_MAP[priority]) {
    return { ok: false };
  }
  const req = await prisma.request.update({
    where: { id: requestId },
    data: { priority },
  });
  refreshLists(req.key);
  return { ok: true };
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
  // La etapa solo vale si pertenece al proyecto elegido.
  const stageRaw = String(formData.get("stageId") || "");
  const stage =
    projectId && stageRaw
      ? await prisma.projectStage.findFirst({ where: { id: stageRaw, projectId }, select: { id: true } })
      : null;

  const req = await prisma.request.update({
    where: { id: requestId },
    data: {
      title,
      description,
      type,
      dueDate: dueStr ? parseLocalDate(dueStr) : null,
      projectId,
      stageId: stage?.id ?? null,
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
      : canActOnRequest(user, req) || (await canActAsClient(user, req.clientId));
  if (!allowed) return;

  await prisma.commentRead.upsert({
    where: { userId_requestId: { userId: user.id, requestId } },
    update: { readAt: new Date() },
    create: { userId: user.id, requestId },
  });
}

// Permiso de proyectos sobre un cliente concreto (alcance "own_clients" =
// solo los clientes que el usuario coordina).
async function canProjectAction(
  user: { id: string; capabilities: Capabilities; ownClientIds?: string[] },
  action: ActionId,
  clientId: string,
) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, accountManagerId: true },
  });
  return !!client && canOnClient(user.capabilities, action, user.id, client, user.ownClientIds);
}

export async function createProject(clientId: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user || !(await canProjectAction(user, "projects.manage", clientId))) return;
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const slug = await uniqueSlug(name, (s) => projectSlugTaken(s));
  const project = await prisma.project.create({ data: { name, clientId, slug } });
  await logAudit({
    type: "admin_project_created",
    actorId: user.id,
    actorEmail: user.email,
    detail: `projectId=${project.id}, clientId=${clientId}`,
  });
  revalidatePath(`/admin/clientes/${clientId}`);
}

// Crear proyecto desde /proyectos/nuevo: nombre + cliente y, si el usuario
// puede cargar cubicación (projects.budget), fechas y horas estimadas.
export async function createNewProject(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const clientId = String(formData.get("clientId") || "");
  const name = String(formData.get("name") || "").trim();
  const back = (error: string) => `/proyectos/nuevo?error=${error}${clientId ? `&cliente=${clientId}` : ""}`;
  if (!clientId) redirect(back("cliente"));
  if (!name) redirect(back("nombre"));
  if (!(await canProjectAction(user, "projects.manage", clientId))) redirect("/proyectos");

  const withBudget = await canProjectAction(user, "projects.budget", clientId);
  const startDate = withBudget ? optDate(formData.get("startDate")) : null;
  const endDate = withBudget ? optDate(formData.get("endDate")) : null;
  if (startDate && endDate && endDate < startDate) redirect(back("fechas"));

  const slug = await uniqueSlug(name, (s) => projectSlugTaken(s));
  const project = await prisma.project.create({
    data: {
      name,
      slug,
      clientId,
      startDate,
      endDate,
      estimatedHours: withBudget ? optHours(formData.get("estimatedHours")) : null,
    },
  });
  await logAudit({
    type: "admin_project_created",
    actorId: user.id,
    actorEmail: user.email,
    detail: `projectId=${project.id}, clientId=${clientId}`,
  });
  revalidatePath("/proyectos");
  redirect(`/proyectos/${project.slug}`);
}

async function projectSlugTaken(slug: string) {
  return (await prisma.project.count({ where: { slug } })) > 0;
}

export async function setProjectActive(projectId: string, isActive: boolean) {
  const user = await getSessionUser();
  const current = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
  if (!user || !current || !(await canProjectAction(user, "projects.manage", current.clientId))) return;
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

// ── Proyecto como mini-ecosistema (etapa 1) ───────────────────

const optDate = (v: FormDataEntryValue | null) => {
  const s = String(v || "");
  return s ? parseLocalDate(s) : null;
};
const optHours = (v: FormDataEntryValue | null) => {
  const n = Number(String(v || "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function projectForAction(
  user: { id: string; capabilities: Capabilities; ownClientIds?: string[] },
  projectId: string,
  action: ActionId,
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || !(await canProjectAction(user, action, project.clientId))) return null;
  return project;
}

// Cubicación estimada inicial: horas y/o fechas (todo opcional).
export async function updateProjectBudget(projectId: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user) return;
  const project = await projectForAction(user, projectId, "projects.budget");
  if (!project) return;
  const startDate = optDate(formData.get("startDate"));
  const endDate = optDate(formData.get("endDate"));
  if (startDate && endDate && endDate < startDate) redirect(`/proyectos/${projectId}?error=fechas`);
  // El marco no puede dejar afuera etapas ya definidas.
  const stages = await prisma.projectStage.findMany({ where: { projectId } });
  if (stages.some((s) => stageDateIssue(s, { startDate, endDate }) === "fuera_marco")) {
    redirect(`/proyectos/${projectId}?error=etapas_fuera`);
  }
  await prisma.project.update({
    where: { id: projectId },
    data: { startDate, endDate, estimatedHours: optHours(formData.get("estimatedHours")) },
  });
  await logAudit({
    type: "project_budget_updated",
    actorId: user.id,
    actorEmail: user.email,
    detail: `projectId=${projectId}`,
  });
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/proyectos");
}

// Quién puede tocar una etapa: las propuestas son parte de la cubicación
// (projects.budget); las adicionales, creadas con el proyecto en curso,
// las gestiona projects.manage. Antes de confirmar la cubicación toda
// etapa nueva es propuesta.
function stageAction(project: { baselineAt: Date | null }, stage: { isAdditional: boolean } | null): ActionId {
  const additional = stage ? stage.isAdditional : !!project.baselineAt;
  return additional ? "projects.manage" : "projects.budget";
}

// Congela la cubicación: lo propuesto queda como referencia del comparativo.
export async function confirmProjectBudget(projectId: string) {
  const user = await getSessionUser();
  if (!user) return;
  const project = await projectForAction(user, projectId, "projects.budget");
  if (!project || project.baselineAt) return;
  if (!project.estimatedHours && !(project.startDate && project.endDate)) {
    redirect(`/proyectos/${projectId}?error=cubicacion_vacia`);
  }
  // Lo adicional pasa a ser parte de la nueva referencia (si se reabrió antes).
  await prisma.$transaction([
    prisma.project.update({ where: { id: projectId }, data: { baselineAt: new Date() } }),
    prisma.projectStage.updateMany({ where: { projectId }, data: { isAdditional: false } }),
  ]);
  await logAudit({
    type: "project_budget_confirmed",
    actorId: user.id,
    actorEmail: user.email,
    detail: `projectId=${projectId}`,
  });
  revalidatePath(`/proyectos/${projectId}`);
}

// Reabrir la cubicación (director / projects.budget): vuelve a permitir
// editar lo propuesto libremente hasta confirmarla de nuevo. Queda auditado
// porque cambia la referencia del comparativo.
export async function reopenProjectBudget(projectId: string) {
  const user = await getSessionUser();
  if (!user) return;
  const project = await projectForAction(user, projectId, "projects.budget");
  if (!project || !project.baselineAt) return;
  await prisma.project.update({ where: { id: projectId }, data: { baselineAt: null } });
  await logAudit({
    type: "project_budget_reopened",
    actorId: user.id,
    actorEmail: user.email,
    detail: `projectId=${projectId}, confirmadaEl=${project.baselineAt.toISOString()}`,
  });
  revalidatePath(`/proyectos/${projectId}`);
}

export async function saveStage(projectId: string, stageId: string | null, formData: FormData) {
  const user = await getSessionUser();
  if (!user) return;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return;
  const stage = stageId ? await prisma.projectStage.findFirst({ where: { id: stageId, projectId } }) : null;
  if (stageId && !stage) return;
  const action = stageAction(project, stage);
  if (!(await canProjectAction(user, action, project.clientId))) return;

  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const startDate = optDate(formData.get("startDate"));
  const endDate = optDate(formData.get("endDate"));
  const issue = stageDateIssue({ startDate, endDate }, project);
  if (issue === "orden") redirect(`/proyectos/${projectId}?error=fechas`);
  if (issue === "fuera_marco") redirect(`/proyectos/${projectId}?error=fuera_marco`);
  // Con el proyecto en curso, una etapa adicional debe declarar sus fechas
  // para poder comprobar que cabe en el marco inicial.
  const isNewAdditional = !stage && !!project.baselineAt;
  if (isNewAdditional && project.startDate && project.endDate && (!startDate || !endDate)) {
    redirect(`/proyectos/${projectId}?error=fechas_requeridas`);
  }
  const data = { name, startDate, endDate, estimatedHours: optHours(formData.get("estimatedHours")) };
  if (stage) {
    await prisma.projectStage.update({ where: { id: stage.id }, data });
    if (!stage.isAdditional && project.baselineAt) {
      // Cambiar lo propuesto después de confirmar altera el comparativo: queda registrado.
      await logAudit({
        type: "project_baseline_stage_changed",
        actorId: user.id,
        actorEmail: user.email,
        detail: `projectId=${projectId}, stageId=${stage.id}`,
      });
    }
  } else {
    const last = await prisma.projectStage.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    await prisma.projectStage.create({
      data: { ...data, projectId, sortOrder: (last._max.sortOrder ?? 0) + 1, isAdditional: isNewAdditional },
    });
  }
  revalidatePath(`/proyectos/${projectId}`);
}

export async function deleteStage(projectId: string, stageId: string) {
  const user = await getSessionUser();
  if (!user) return;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const stage = await prisma.projectStage.findFirst({ where: { id: stageId, projectId } });
  if (!project || !stage) return;
  if (!(await canProjectAction(user, stageAction(project, stage), project.clientId))) return;
  // Las solicitudes de la etapa quedan sin etapa (onDelete: SetNull).
  await prisma.projectStage.delete({ where: { id: stage.id } });
  if (!stage.isAdditional && project.baselineAt) {
    await logAudit({
      type: "project_baseline_stage_deleted",
      actorId: user.id,
      actorEmail: user.email,
      detail: `projectId=${projectId}, stage=${stage.name}`,
    });
  }
  revalidatePath(`/proyectos/${projectId}`);
}

// Asignar una tarea a una etapa desde la ficha del proyecto.
export async function setRequestStage(requestId: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user) return;
  const req = await prisma.request.findUnique({ where: { id: requestId }, select: { projectId: true } });
  if (!req?.projectId || !(await projectForAction(user, req.projectId, "projects.manage"))) return;
  const raw = String(formData.get("stageId") || "");
  const stage = raw
    ? await prisma.projectStage.findFirst({ where: { id: raw, projectId: req.projectId }, select: { id: true } })
    : null;
  await prisma.request.update({ where: { id: requestId }, data: { stageId: stage?.id ?? null } });
  revalidatePath(`/proyectos/${req.projectId}`);
}

export async function createCustomField(formData: FormData) {
  const user = await getSessionUser();
  if (!user || !user.roleCodes.includes("ADMIN")) redirect("/mi-espacio");
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
  if (!user || !user.roleCodes.includes("ADMIN")) return;
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
  const isOptional = formData.get("isOptional") === "on";
  const waitsOnClient = formData.get("waitsOnClient") === "on";
  const sortOrderRaw = formData.get("sortOrder");
  const sortOrder =
    sortOrderRaw !== null && sortOrderRaw !== ""
      ? Number(sortOrderRaw)
      : fallbackSortOrder;
  return { label, color, isFinal, isOptional, waitsOnClient, sortOrder };
}

export async function createStatus(formData: FormData) {
  const user = await getSessionUser();
  if (!user || !user.roleCodes.includes("ADMIN")) redirect("/mi-espacio");

  const code = String(formData.get("code") || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const count = await prisma.status.count();
  const { label, color, isFinal, isOptional, waitsOnClient, sortOrder } = statusFormValues(formData, count);
  if (!code || !label) redirect("/admin/estados?error=datos");

  const existing = await prisma.status.findUnique({ where: { code } });
  if (existing) redirect("/admin/estados?error=code_existente");

  const status = await prisma.status.create({
    data: { code, label, color, isFinal, isOptional, waitsOnClient, sortOrder },
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
  if (!user || !user.roleCodes.includes("ADMIN")) redirect("/mi-espacio");

  const { label, color, isFinal, isOptional, waitsOnClient, sortOrder } = statusFormValues(formData, 0);
  if (!label) redirect("/admin/estados?error=datos");

  await prisma.status.update({
    where: { id: statusId },
    data: { label, color, isFinal, isOptional, waitsOnClient, sortOrder },
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
  if (!user || !user.roleCodes.includes("ADMIN")) return;
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

// ---------- Administración: roles y permisos (Nuevo #3, ADR-011) ----------

export async function createRole(formData: FormData) {
  const user = await getSessionUser();
  if (!user || !user.roleCodes.includes("ADMIN")) redirect("/mi-espacio");

  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/admin/roles?error=datos");

  const code = name
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const existing = await prisma.role.findUnique({ where: { code } });
  if (existing) redirect("/admin/roles?error=code_existente");

  const role = await prisma.role.create({ data: { code, name } });
  await logAudit({
    type: "admin_role_created",
    actorId: user.id,
    actorEmail: user.email,
    detail: `roleId=${role.id}, code=${role.code}`,
  });
  revalidatePath("/admin/roles");
  redirect(`/admin/roles/${role.id}`);
}

export async function updateRolePermissions(roleId: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user || !user.roleCodes.includes("ADMIN")) redirect("/mi-espacio");

  const name = String(formData.get("name") || "").trim();
  if (!name) redirect(`/admin/roles/${roleId}?error=datos`);

  await prisma.$transaction([
    prisma.role.update({ where: { id: roleId }, data: { name } }),
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: ACTIONS.filter((a) => {
        const scope = String(formData.get(`scope__${a.key}`) || "none");
        return scope !== "none";
      }).map((a) => ({
        roleId,
        action: a.key,
        scope: String(formData.get(`scope__${a.key}`) || "none"),
      })),
    }),
  ]);
  await logAudit({
    type: "admin_role_permissions_updated",
    actorId: user.id,
    actorEmail: user.email,
    detail: `roleId=${roleId}`,
  });
  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${roleId}`);
  redirect("/admin/roles");
}

export async function setRoleActive(roleId: string, isActive: boolean) {
  const user = await getSessionUser();
  if (!user || !user.roleCodes.includes("ADMIN")) return;
  await prisma.role.update({
    where: { id: roleId },
    data: { archivedAt: isActive ? null : new Date() },
  });
  await logAudit({
    type: isActive ? "admin_role_reactivated" : "admin_role_archived",
    actorId: user.id,
    actorEmail: user.email,
    detail: `roleId=${roleId}`,
  });
  revalidatePath("/admin/roles");
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

// Corrección de horas ya cargadas (typo, fecha errada, etc.) — a
// diferencia de comentarios (donde solo el autor edita lo suyo), acá
// cualquiera con el permiso hours.manage puede corregir horas de
// cualquier persona, porque el problema típico es "alguien más se dio
// cuenta del error", no el propio autor.
async function timeEntryForAction(
  user: { id: string; capabilities: Capabilities; ownClientIds?: string[] },
  entryId: string,
) {
  const entry = await prisma.timeEntry.findUnique({
    where: { id: entryId },
    include: { request: { include: { client: true } } },
  });
  if (!entry) return null;
  return canOnClient(user.capabilities, "hours.manage", user.id, entry.request.client, user.ownClientIds)
    ? entry
    : null;
}

export async function updateTimeEntry(entryId: string, formData: FormData) {
  const user = await getSessionUser();
  if (!user) return;
  const entry = await timeEntryForAction(user, entryId);
  if (!entry) return;
  const hours = parseFloat(String(formData.get("hours") || "0"));
  if (!hours || hours <= 0) return;
  const note = String(formData.get("note") || "").trim();
  const dateStr = String(formData.get("date") || "");

  await prisma.timeEntry.update({
    where: { id: entryId },
    data: { hours, note: note || null, ...(dateStr ? { date: parseLocalDate(dateStr) } : {}) },
  });
  await prisma.activity.create({
    data: {
      requestId: entry.requestId,
      type: "time_edited",
      message: `Corrigió una carga de horas de ${entry.userId === user.id ? "sí mismo" : "otra persona"} a ${hours} h`,
      actorName: user.name,
    },
  });
  revalidatePath(`/solicitudes/${entry.request.key}`);
  revalidatePath("/bolsa");
  revalidatePath("/dashboard");
}

export async function deleteTimeEntry(entryId: string) {
  const user = await getSessionUser();
  if (!user) return;
  const entry = await timeEntryForAction(user, entryId);
  if (!entry) return;

  // Si nació de un bloque del calendario, se desvincula (el bloque queda
  // "sin confirmar" otra vez) en vez de quedar apuntando a nada.
  await prisma.$transaction([
    prisma.scheduleBlock.updateMany({ where: { timeEntryId: entryId }, data: { timeEntryId: null } }),
    prisma.timeEntry.delete({ where: { id: entryId } }),
  ]);
  await prisma.activity.create({
    data: {
      requestId: entry.requestId,
      type: "time_edited",
      message: `Eliminó una carga de ${entry.hours} h`,
      actorName: user.name,
    },
  });
  revalidatePath(`/solicitudes/${entry.request.key}`);
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
    if (!user || !(await canActAsClient(user, req.clientId))) return;
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

// Rec. #33 — solo el autor puede editar/eliminar su propio comentario, y
// solo comentarios de equipo (authorId real): los del portal del cliente
// se guardan con authorId null (ver addComment), fuera de alcance acá.
export async function editComment(commentId: string, body: string) {
  const user = await getSessionUser();
  if (!user) return;
  const trimmed = body.trim();
  if (!trimmed) return;
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { request: { select: { key: true } } },
  });
  if (!comment || !comment.authorId || comment.authorId !== user.id) return;

  await prisma.comment.update({ where: { id: commentId }, data: { body: trimmed } });
  revalidatePath(`/solicitudes/${comment.request.key}`);
}

export async function deleteComment(commentId: string) {
  const user = await getSessionUser();
  if (!user) return;
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { request: { select: { key: true } } },
  });
  if (!comment || !comment.authorId || comment.authorId !== user.id) return;

  await prisma.comment.delete({ where: { id: commentId } });
  revalidatePath(`/solicitudes/${comment.request.key}`);
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

// Rec. #34 — mismo permiso que agregar un adjunto (canActOnRequest), no
// "solo quien lo subió": Attachment no registra quién lo subió, y
// exigirlo obligaría a migrar datos existentes por un ítem P2.
export async function deleteAttachment(attachmentId: string) {
  const user = await getSessionUser();
  if (!user) return;
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: { request: { include: { client: true, collaborators: true } } },
  });
  if (!attachment || !canActOnRequest(user, attachment.request)) return;

  await prisma.attachment.delete({ where: { id: attachmentId } });
  if (attachment.kind !== "url") {
    const filename = attachment.url.split("/").pop();
    if (filename) await deleteFromStorage(filename).catch(() => {});
  }
  revalidatePath(`/solicitudes/${attachment.request.key}`);
}

export async function setClientPriority(
  requestId: string,
  value: number,
): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  const v = Math.round(value);
  if (!user || v < 1 || v > 5) return { ok: false };
  const existing = await prisma.request.findUnique({
    where: { id: requestId },
    select: { clientId: true },
  });
  if (!existing || !(await canActAsClient(user, existing.clientId))) return { ok: false };
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
  return { ok: true };
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
      ...(statusChanges
        ? { status: newStatus, statusChanges: { create: { status: newStatus, actorName: user.name } } }
        : {}),
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
  if (!clientId || !title) redirect("/solicitar?error=datos");
  if (!isValidEmail(requesterEmail)) redirect("/solicitar?error=correo");
  // Sitio/proyecto opcional: solo si pertenece a la empresa elegida.
  const rawProject = String(formData.get("projectId") || "");
  const project = rawProject
    ? await prisma.project.findFirst({
        where: { id: rawProject, clientId, archivedAt: null },
        select: { id: true },
      })
    : null;

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
        projectId: project?.id ?? null,
        status: "SIN_TRIAGE",
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
    body: `Recibimos tu solicitud "${title}" para ${req.client.name}. Su folio es ${req.key} y su estado es "Sin triaje". Te avisaremos por correo cada cambio de estado.`,
  });
  refreshLists();
  redirect(`/solicitar/gracias?key=${req.key}`);
}

// ── Portal del cliente ──────────────────────────────────────────
// El login del portal usa la misma acción `login` (arriba) con
// target="portal"; logout usa la misma `logout`.

// Selector "ver como cliente": solo acepta clientes a los que el usuario
// tiene acceso (getPortalContext ignora cualquier otro valor).
export async function setPortalClient(formData: FormData) {
  const user = await getSessionUser();
  if (!user) return;
  const clientId = String(formData.get("clientId") || "");
  if (await canActAsClient(user, clientId)) {
    (await cookies()).set(PORTAL_CLIENT_COOKIE, clientId, { path: "/", httpOnly: true, sameSite: "lax" });
  }
  redirect("/portal");
}

export async function submitClientRequest(formData: FormData) {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal");
  const email = ctx.user.email;
  const client = ctx.client;

  const type = String(formData.get("type") || "Otro");
  // Sitio/proyecto opcional: solo si pertenece a este cliente.
  const rawProject = String(formData.get("projectId") || "");
  const project = rawProject
    ? await prisma.project.findFirst({
        where: { id: rawProject, clientId: client.id, archivedAt: null },
        select: { id: true },
      })
    : null;
  const description = String(formData.get("description") || "").trim();
  const rawPriority = String(formData.get("priority") || "MEDIA");
  const priority = PRIORITY_MAP[rawPriority] ? rawPriority : "MEDIA";
  const dueStr = String(formData.get("dueDate") || "");
  const file = formData.get("file") as File | null;
  if (!description) redirect("/portal/nueva?error=descripcion");

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
        projectId: project?.id ?? null,
        status: "SIN_TRIAGE",
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
    body: `Recibimos tu solicitud de ${type} para ${client.name}. Su folio es ${req.key} y su estado es "Sin triaje". Te avisaremos por correo cada cambio de estado.`,
  });
  refreshLists();
  revalidatePath("/portal", "layout");
  redirect(`/portal/solicitudes?ok=${req.key}`);
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

// Personas asignadas a un cliente (solo equipo interno; ids inválidos se descartan).
async function validMemberIds(formData: FormData) {
  const ids = formData.getAll("memberIds").map(String).filter(Boolean);
  if (ids.length === 0) return [];
  const found = await prisma.user.findMany({
    where: { id: { in: ids }, role: { not: "CLIENTE" } },
    select: { id: true },
  });
  return found.map((u) => u.id);
}

export async function createClient(formData: FormData) {
  const user = await getSessionUser();
  if (!user || !user.roleCodes.includes("ADMIN")) redirect("/mi-espacio");

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
      members: { create: (await validMemberIds(formData)).map((userId) => ({ userId })) },
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
  if (!user || !user.roleCodes.includes("ADMIN")) redirect("/mi-espacio");

  const name = String(formData.get("name") || "").trim();
  if (!name) redirect(`/admin/clientes/${id}?error=nombre`);

  const memberIds = await validMemberIds(formData);
  await prisma.client.update({
    where: { id },
    data: {
      members: { deleteMany: {}, create: memberIds.map((userId) => ({ userId })) },
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
  if (!user || !user.roleCodes.includes("ADMIN")) return;
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
  if (!user || !user.roleCodes.includes("ADMIN")) redirect("/mi-espacio");

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

// Clientes que un usuario de equipo puede ver/usar como cliente en el
// portal (solo aplica a cuentas de equipo; ids inexistentes se descartan).
async function validPortalClientIds(formData: FormData, isClientAccount: boolean) {
  if (isClientAccount) return [];
  const ids = formData.getAll("portalClientIds").map(String).filter(Boolean);
  if (ids.length === 0) return [];
  const found = await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return found.map((c) => c.id);
}

// Clientes para los que trabaja un usuario de equipo (asignación al cliente).
async function validMemberClientIds(formData: FormData, isClientAccount: boolean) {
  if (isClientAccount) return [];
  const ids = formData.getAll("memberClientIds").map(String).filter(Boolean);
  if (ids.length === 0) return [];
  const found = await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return found.map((c) => c.id);
}

export async function createUser(formData: FormData) {
  const user = await getSessionUser();
  if (!user || !user.roleCodes.includes("ADMIN")) redirect("/mi-espacio");

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  // Nuevo #3 — CLIENTE sigue siendo un valor especial de User.role
  // (portal), separado del sistema de roles/permisos de equipo. Un
  // usuario de equipo puede tener uno o varios roles (checkboxes).
  const isClientAccount = String(formData.get("accountType") || "STAFF") === "CLIENTE";
  const roleIds = isClientAccount ? [] : formData.getAll("roleIds").map(String).filter(Boolean);
  if (!name || !email || (!isClientAccount && roleIds.length === 0)) {
    redirect("/admin/usuarios/nuevo?error=datos");
  }
  if (!isValidEmail(email)) redirect("/admin/usuarios/nuevo?error=correo");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect("/admin/usuarios/nuevo?error=email_existente");

  const clientId = isClientAccount ? String(formData.get("clientId") || "") || null : null;
  if (isClientAccount && !clientId) redirect("/admin/usuarios/nuevo?error=cliente_requerido");

  const roles = isClientAccount
    ? []
    : await prisma.role.findMany({ where: { id: { in: roleIds }, archivedAt: null } });
  if (!isClientAccount && roles.length === 0) redirect("/admin/usuarios/nuevo?error=datos");

  const created = await prisma.user.create({
    data: {
      name,
      email,
      // Ya no decide permisos — solo respaldo legible (ver nota en schema).
      role: isClientAccount ? "CLIENTE" : roles[0].code,
      color: String(formData.get("color") || "").trim() || null,
      teamId: isClientAccount ? null : String(formData.get("teamId") || "") || null,
      clientId,
      isActive: true,
      mustChangePassword: true,
      roles: isClientAccount ? undefined : { create: roles.map((r) => ({ roleId: r.id })) },
      portalAccess: {
        create: (await validPortalClientIds(formData, isClientAccount)).map((clientId) => ({ clientId })),
      },
      clientMemberships: {
        create: (await validMemberClientIds(formData, isClientAccount)).map((clientId) => ({ clientId })),
      },
    },
  });
  await logAudit({
    type: "admin_user_created",
    actorId: user.id,
    actorEmail: user.email,
    detail: `userId=${created.id}, email=${created.email}, roles=${isClientAccount ? "CLIENTE" : roles.map((r) => r.code).join(",")}`,
  });

  const rawToken = await issuePasswordResetToken(created.id, INVITE_TOKEN_TTL_MS);
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
  if (!user || !user.roleCodes.includes("ADMIN")) redirect("/mi-espacio");

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const isClientAccount = String(formData.get("accountType") || "STAFF") === "CLIENTE";
  const roleIds = isClientAccount ? [] : formData.getAll("roleIds").map(String).filter(Boolean);
  if (!name || !email || (!isClientAccount && roleIds.length === 0)) {
    redirect(`/admin/usuarios/${id}?error=datos`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== id) redirect(`/admin/usuarios/${id}?error=email_existente`);

  const clientId = isClientAccount ? String(formData.get("clientId") || "") || null : null;
  if (isClientAccount && !clientId) redirect(`/admin/usuarios/${id}?error=cliente_requerido`);

  const roles = isClientAccount
    ? []
    : await prisma.role.findMany({ where: { id: { in: roleIds }, archivedAt: null } });
  if (!isClientAccount && roles.length === 0) redirect(`/admin/usuarios/${id}?error=datos`);

  const portalClientIds = await validPortalClientIds(formData, isClientAccount);
  const memberClientIds = await validMemberClientIds(formData, isClientAccount);
  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: id } }),
    prisma.userClientAccess.deleteMany({ where: { userId: id } }),
    prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        role: isClientAccount ? "CLIENTE" : roles[0].code,
        color: String(formData.get("color") || "").trim() || null,
        teamId: isClientAccount ? null : String(formData.get("teamId") || "") || null,
        clientId,
        isActive: formData.get("isActive") === "on",
        roles: isClientAccount ? undefined : { create: roles.map((r) => ({ roleId: r.id })) },
        portalAccess: { create: portalClientIds.map((clientId) => ({ clientId })) },
        clientMemberships: { deleteMany: {}, create: memberClientIds.map((clientId) => ({ clientId })) },
      },
    }),
  ]);
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
  if (!user || !user.roleCodes.includes("ADMIN")) return;
  await prisma.user.update({ where: { id }, data: { isActive } });
  await logAudit({
    type: isActive ? "admin_user_reactivated" : "admin_user_deactivated",
    actorId: user.id,
    actorEmail: user.email,
    detail: `userId=${id}`,
  });
  revalidateAdmin();
}

// Mismo criterio que deleteTeam: solo se puede borrar un usuario sin
// actividad real (nada asignado, sin horas cargadas, no es cuenta
// gerente de ningún cliente) — si tiene algo de eso, se desactiva en vez
// de borrar (Rmap #10: no hace falta una papelera separada). No se deja
// borrar la propia cuenta, para no quedar sin ningún Admin con acceso.
// Reenvía el link de alta a quien aún no define contraseña (el anterior queda
// invalidado por issuePasswordResetToken).
export async function resendInvite(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user || !user.roleCodes.includes("ADMIN")) return { ok: false, error: "Sin permiso" };
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || !target.isActive) return { ok: false, error: "Usuario inactivo o inexistente" };
  if (target.passwordHash) return { ok: false, error: "Ya definió su contraseña" };
  try {
    const rawToken = await issuePasswordResetToken(target.id, INVITE_TOKEN_TTL_MS);
    await sendWelcomeEmail({
      to: target.email,
      name: target.name,
      resetUrl: `/restablecer-contrasena?token=${rawToken}`,
    });
  } catch {
    return { ok: false, error: "No se pudo enviar el correo" };
  }
  await logAudit({
    type: "admin_invite_resent",
    actorId: user.id,
    actorEmail: user.email,
    detail: `userId=${target.id}, email=${target.email}`,
  });
  revalidateAdmin();
  return { ok: true };
}

export async function deleteUser(id: string) {
  const user = await getSessionUser();
  if (!user || !user.roleCodes.includes("ADMIN")) return;
  if (id === user.id) return;

  const target = await prisma.user.findUnique({
    where: { id },
    include: {
      assigned: { select: { id: true } },
      timeEntries: { select: { id: true } },
      managedClients: { select: { id: true } },
    },
  });
  if (
    !target ||
    target.assigned.length > 0 ||
    target.timeEntries.length > 0 ||
    target.managedClients.length > 0
  ) {
    return;
  }

  // Metadata sin FK en cascada (Comment.authorId no se toca — un
  // comentario sí cuenta como actividad real, pero no lo filtramos arriba
  // porque un usuario recién creado nunca tiene uno; si algún día lo
  // tiene, prisma.user.delete fallará por la FK y no se romperá nada).
  await prisma.$transaction([
    prisma.nudgeShown.deleteMany({ where: { userId: id } }),
    prisma.aiMemoryNote.deleteMany({ where: { userId: id } }),
    prisma.commentRead.deleteMany({ where: { userId: id } }),
    prisma.requestCollaborator.deleteMany({ where: { userId: id } }),
    prisma.user.delete({ where: { id } }),
  ]);
  await logAudit({
    type: "admin_user_deleted",
    actorId: user.id,
    actorEmail: user.email,
    detail: `userId=${id}, email=${target.email}`,
  });
  revalidateAdmin();
}

export async function createTeam(formData: FormData) {
  const user = await getSessionUser();
  if (!user || !user.roleCodes.includes("ADMIN")) redirect("/mi-espacio");

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
  if (!user || !user.roleCodes.includes("ADMIN")) redirect("/mi-espacio");

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
  if (!user || !user.roleCodes.includes("ADMIN")) return;
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

// ── Perfil personal: calendario de bloques de horario (etapa 1) ────────
// No son server actions ligadas a un <form> — se llaman desde el cliente
// (useTransition) porque el calendario necesita el resultado (choques de
// horario, id creado) para actualizar la vista sin recargar la página.

type ScheduleResult = { ok: boolean; overlaps?: { key: string; title: string; start: string; end: string }[] };

function parseDateTimeLocal(s: string): Date | null {
  // <input type="datetime-local"> entrega "YYYY-MM-DDTHH:mm" en hora de
  // Chile (así lo arma toLocalInput en el cliente) — zonedTimeToUtc, no
  // new Date(s), porque acá corre con la zona horaria del proceso, que en
  // Vercel es UTC y no Chile.
  return zonedTimeToUtc(s);
}

async function ownedBlock(userId: string, blockId: string) {
  const block = await prisma.scheduleBlock.findUnique({ where: { id: blockId } });
  return block && block.userId === userId ? block : null;
}

async function overlapWarnings(userId: string, start: Date, end: Date, excludeId?: string) {
  const blocks = await prisma.scheduleBlock.findMany({
    where: { userId, id: excludeId ? { not: excludeId } : undefined },
    include: { request: { select: { key: true, title: true } } },
  });
  return overlapsOf(blocks, start, end).map((b) => ({
    key: b.request.key,
    title: b.request.title,
    start: b.start.toISOString(),
    end: b.end.toISOString(),
  }));
}

// Crea el bloque, ligado a una tarea existente o a una nueva creada al
// vuelo con los mismos campos que una tarea común (tipo, cliente,
// prioridad, etc.). El choque de horario nunca bloquea: solo se informa.
export async function createScheduleBlock(formData: FormData): Promise<ScheduleResult> {
  const user = await getSessionUser();
  if (!user || !isTeamRole(user.role)) return { ok: false };

  const start = parseDateTimeLocal(String(formData.get("start") || ""));
  const end = parseDateTimeLocal(String(formData.get("end") || ""));
  if (!start || !end || end <= start) return { ok: false };

  const mode = String(formData.get("mode") || "existing");
  let requestId = String(formData.get("requestId") || "");

  if (mode === "new") {
    const clientId = String(formData.get("clientId") || "");
    const title = String(formData.get("title") || "").trim();
    if (!clientId || !title) return { ok: false };
    const rawProject = String(formData.get("projectId") || "");
    const project = rawProject
      ? await prisma.project.findFirst({ where: { id: rawProject, clientId, archivedAt: null }, select: { id: true } })
      : null;
    const type = String(formData.get("type") || "Otro");
    const rawPriority = String(formData.get("priority") || "MEDIA");
    const priority = PRIORITY_MAP[rawPriority] ? rawPriority : "MEDIA";
    const req = await withKeyRetry((key) =>
      prisma.request.create({
        data: {
          key,
          title,
          type,
          description: String(formData.get("description") || ""),
          priority,
          clientId,
          projectId: project?.id ?? null,
          assigneeId: user.id,
          status: "POR_HACER",
        },
      }),
    );
    await prisma.activity.create({
      data: { requestId: req.id, type: "created", message: "Creó la tarea desde su calendario", actorName: user.name },
    });
    requestId = req.id;
  } else {
    if (!requestId) return { ok: false };
    const exists = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true } });
    if (!exists) return { ok: false };
  }

  const block = await prisma.scheduleBlock.create({
    data: { userId: user.id, requestId, start, end, note: String(formData.get("note") || "").trim() || null },
  });
  const overlaps = await overlapWarnings(user.id, start, end, block.id);
  revalidatePath("/perfil");
  return { ok: true, overlaps };
}

// Mover o redimensionar un bloque (arrastrar en el calendario).
export async function updateScheduleBlock(blockId: string, start: string, end: string): Promise<ScheduleResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const block = await ownedBlock(user.id, blockId);
  if (!block) return { ok: false };
  const s = parseDateTimeLocal(start);
  const e = parseDateTimeLocal(end);
  if (!s || !e || e <= s) return { ok: false };

  await prisma.scheduleBlock.update({ where: { id: blockId }, data: { start: s, end: e } });
  const overlaps = await overlapWarnings(user.id, s, e, blockId);
  revalidatePath("/perfil");
  return { ok: true, overlaps };
}

export async function deleteScheduleBlock(blockId: string): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const block = await ownedBlock(user.id, blockId);
  if (!block) return { ok: false };
  await prisma.scheduleBlock.delete({ where: { id: blockId } });
  revalidatePath("/perfil");
  return { ok: true };
}

// Confirma el bloque como horas reales: crea el TimeEntry (editable antes
// de guardar, precargado con la duración del bloque) y lo enlaza.
export async function confirmScheduleBlockHours(blockId: string, formData: FormData): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const block = await ownedBlock(user.id, blockId);
  if (!block || block.timeEntryId) return { ok: false };
  const hours = parseFloat(String(formData.get("hours") || "0"));
  if (!hours || hours <= 0) return { ok: false };
  const note = String(formData.get("note") || "").trim();
  const dateStr = String(formData.get("date") || "");

  const entry = await prisma.timeEntry.create({
    data: {
      requestId: block.requestId,
      userId: user.id,
      hours,
      note: note || null,
      date: dateStr ? parseLocalDate(dateStr) : block.start,
    },
  });
  await prisma.scheduleBlock.update({ where: { id: blockId }, data: { timeEntryId: entry.id } });
  await prisma.activity.create({
    data: {
      requestId: block.requestId,
      type: "time_logged",
      message: `Cargó ${hours} h desde su calendario${note ? ` — ${note}` : ""}`,
      actorName: user.name,
    },
  });
  revalidatePath("/perfil");
  revalidatePath("/bolsa");
  revalidatePath("/dashboard");
  return { ok: true };
}
