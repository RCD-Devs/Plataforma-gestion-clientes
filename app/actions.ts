"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSessionUser, createSession, destroySession, redirectForRole } from "@/lib/session";
import {
  assertNewPasswordAllowed,
  rotateUserPassword,
  PasswordPolicyError,
} from "@/lib/password";
import { sendPasswordReset } from "@/lib/email";
import { isTeamRole, isManager, canActOnRequest } from "@/lib/authz";
import { sniffFile, MAX_FILE_SIZE_BYTES } from "@/lib/files";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import crypto from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { notifyClient, notifyTeam } from "@/lib/email";
import { STATUS_MAP, PRIORITY_MAP } from "@/lib/constants";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

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
    const rawToken = crypto.randomBytes(32).toString("hex");
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
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
  if (!user || !STATUS_MAP[status]) return;
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { client: true },
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
    include: { client: true },
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
      include: { client: true },
    }),
  ]);
  if (!to || !req) return;
  if (!canActOnRequest(user, req)) return;

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

  if (file && file.size > 0 && file.size <= MAX_FILE_SIZE_BYTES) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const sig = sniffFile(bytes);
    if (sig) {
      const dir = path.join(process.cwd(), "uploads");
      await mkdir(dir, { recursive: true });
      const id = crypto.randomUUID();
      await writeFile(path.join(dir, id + sig.ext), bytes);
      await prisma.attachment.create({
        data: {
          requestId: req.id,
          kind: sig.kind,
          name: file.name,
          url: `/api/files/${id}${sig.ext}`,
        },
      });
    }
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
