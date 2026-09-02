import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { canViewRequest } from "@/lib/authz";
import {
  StatusSelect,
  AssigneeSelect,
  PrioritySelect,
} from "@/components/controls";
import { Avatar, ClientTag } from "@/components/ui";
import {
  addComment,
  addUrlAttachment,
  logHours,
  createSubtask,
  saveCustomFieldValues,
  markCommentsRead,
} from "@/app/actions";
import { hoursLabel, longDate, shortDate, relative } from "@/lib/format";
import { RequestEditPanel } from "@/components/RequestEditPanel";
import { ArchiveButton } from "@/components/ArchiveButton";
import { CommentActions } from "@/components/CommentActions";
import { CollaboratorsPanel } from "@/components/CollaboratorsPanel";
import { SubmitButton } from "@/components/SubmitButton";
import { getStatusMap, getStatuses, softBg } from "@/lib/statuses";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e6e8eb] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function RequestDetail({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const req = await prisma.request.findUnique({
    where: { key },
    include: {
      client: true,
      assignee: true,
      team: true,
      project: true,
      parent: { select: { key: true, title: true } },
      subtasks: { orderBy: { createdAt: "asc" }, include: { assignee: true } },
      collaborators: { include: { user: true } },
      customFieldValues: { include: { field: true } },
      attachments: { orderBy: { createdAt: "desc" } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: true } },
      timeEntries: { orderBy: { date: "desc" }, include: { user: true } },
      activities: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!req) notFound();
  if (!canViewRequest(user, req)) notFound();

  const [users, projects, customFields, statuses, statusMap] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "CLIENTE" } },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { clientId: req.clientId, archivedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.customFieldDefinition.findMany({
      where: { archivedAt: null },
      orderBy: { sortOrder: "asc" },
    }),
    getStatuses(),
    getStatusMap(),
  ]);
  const totalHours = req.timeEntries.reduce((a, t) => a + t.hours, 0);
  const customFieldValueMap = new Map(
    req.customFieldValues.map((v) => [v.fieldId, v.value]),
  );

  if (user.role !== "CLIENTE") {
    await markCommentsRead(req.id);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e6e8eb] bg-white px-6 py-3">
        <Link
          href="/solicitudes"
          className="text-xs text-[#6b7280] hover:underline"
        >
          ← Solicitudes
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <ClientTag name={req.client.name} />
          <span className="text-xs text-[#9ca3af]">{req.key}</span>
          {req.project && (
            <span className="rounded bg-[#e0fbf9] px-1.5 py-0.5 text-[10px] font-medium text-[#08a89f]">
              {req.project.name}
            </span>
          )}
          {req.parent && (
            <Link
              href={`/solicitudes/${req.parent.key}`}
              className="text-[10px] text-[#08a89f] hover:underline"
            >
              Subtarea de {req.parent.key} · {req.parent.title}
            </Link>
          )}
          {req.archivedAt && (
            <span className="rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-medium text-[#6b7280]">
              Archivada · {shortDate(req.archivedAt)}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">{req.title}</h1>
          <ArchiveButton requestId={req.id} archived={!!req.archivedAt} />
        </div>
      </header>

      <div className="border-b border-[#e6e8eb] bg-white px-6 py-2">
        <RequestEditPanel
          requestId={req.id}
          title={req.title}
          description={req.description}
          type={req.type}
          dueDate={req.dueDate}
          projectId={req.projectId}
          projects={projects}
        />
      </div>

      <div className="flex flex-1 gap-6 overflow-y-auto p-6">
        <div className="min-w-0 flex-1 space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-[#6b7280]">
              Descripción
            </h2>
            <div className="whitespace-pre-wrap rounded-xl border border-[#e6e8eb] bg-white p-4 text-sm">
              {req.description || "—"}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-[#6b7280]">
              Adjuntos
            </h2>
            <div className="space-y-2">
              {req.attachments.map((a) => (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  className="flex items-center gap-2 rounded-lg border border-[#e6e8eb] bg-white px-3 py-2 text-sm hover:bg-[#f9fafb]"
                >
                  <span className="rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-medium text-[#6b7280]">
                    {a.kind === "pdf"
                      ? "PDF"
                      : a.kind === "png"
                        ? "IMG"
                        : a.kind === "url"
                          ? "URL"
                          : "FILE"}
                  </span>
                  <span className="truncate">{a.name}</span>
                </a>
              ))}
              {req.attachments.length === 0 && (
                <div className="text-sm text-[#9ca3af]">Sin adjuntos.</div>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <form action={addUrlAttachment} className="flex gap-2">
                <input type="hidden" name="requestId" value={req.id} />
                <input name="name" placeholder="Nombre" className={inputCls} />
                <input
                  name="url"
                  placeholder="https://…"
                  className={inputCls}
                  required
                />
                <button className="shrink-0 rounded-lg border border-[#e6e8eb] px-3 text-sm hover:bg-[#f3f4f6]">
                  + URL
                </button>
              </form>
              <form
                action="/api/upload"
                method="post"
                encType="multipart/form-data"
                className="flex items-center gap-2"
              >
                <input type="hidden" name="requestId" value={req.id} />
                <input
                  type="file"
                  name="file"
                  accept=".pdf,.png,.jpg,.jpeg,.gif"
                  className="text-sm"
                />
                <button className="shrink-0 rounded-lg border border-[#e6e8eb] px-3 py-2 text-sm hover:bg-[#f3f4f6]">
                  Subir
                </button>
              </form>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-[#6b7280]">
              Subtareas
            </h2>
            <div className="space-y-2">
              {req.subtasks.map((s) => (
                <Link
                  key={s.id}
                  href={`/solicitudes/${s.key}`}
                  className="flex items-center justify-between rounded-lg border border-[#e6e8eb] bg-white px-3 py-2 text-sm hover:bg-[#f9fafb]"
                >
                  <span className="min-w-0 truncate">
                    <span className="text-xs text-[#9ca3af]">{s.key}</span>{" "}
                    {s.title}
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      background: statusMap[s.status]
                        ? softBg(statusMap[s.status].color)
                        : undefined,
                      color: statusMap[s.status]?.color,
                    }}
                  >
                    {statusMap[s.status]?.label ?? s.status}
                  </span>
                </Link>
              ))}
              {req.subtasks.length === 0 && (
                <div className="text-sm text-[#9ca3af]">Sin subtareas.</div>
              )}
            </div>
            <form
              action={createSubtask.bind(null, req.id)}
              className="mt-3 flex gap-2"
            >
              <input
                name="title"
                placeholder="Título de la subtarea…"
                className={inputCls}
                required
              />
              <button className="shrink-0 rounded-lg border border-[#e6e8eb] px-3 text-sm hover:bg-[#f3f4f6]">
                + Subtarea
              </button>
            </form>
          </section>

          {customFields.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-[#6b7280]">
                Campos personalizados
              </h2>
              <form
                action={saveCustomFieldValues.bind(null, req.id)}
                className="space-y-3 rounded-xl border border-[#e6e8eb] bg-white p-4"
              >
                {customFields.map((f) => {
                  const value = customFieldValueMap.get(f.id) ?? "";
                  return (
                    <div key={f.id}>
                      <label className="mb-1 block text-xs font-semibold text-[#6b7280]">
                        {f.label}
                      </label>
                      {f.type === "textarea" ? (
                        <textarea
                          name={`field_${f.id}`}
                          defaultValue={value}
                          rows={3}
                          className={`${inputCls} resize-y`}
                        />
                      ) : f.type === "select" ? (
                        <select
                          name={`field_${f.id}`}
                          defaultValue={value}
                          className={inputCls}
                        >
                          <option value="">—</option>
                          {f.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : f.type === "checkbox" ? (
                        <input
                          type="checkbox"
                          name={`field_${f.id}`}
                          defaultChecked={value === "true"}
                          className="h-4 w-4 accent-[#0bdbcf]"
                        />
                      ) : (
                        <input
                          type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                          name={`field_${f.id}`}
                          defaultValue={value}
                          className={inputCls}
                        />
                      )}
                    </div>
                  );
                })}
                <SubmitButton className="rounded-lg border border-[#e6e8eb] px-3 py-1.5 text-xs hover:bg-[#f3f4f6]">
                  Guardar campos
                </SubmitButton>
              </form>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-[#6b7280]">
              Comentarios
            </h2>
            <div className="space-y-3">
              {req.comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <Avatar
                    name={c.authorName || c.author?.name || "?"}
                    color={c.isClient ? "#0ea5e9" : c.author?.color}
                    size={28}
                  />
                  <div className="min-w-0 flex-1 rounded-lg border border-[#e6e8eb] bg-white p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs text-[#6b7280]">
                      <span className="font-medium text-[#374151]">
                        {c.authorName || c.author?.name}
                      </span>
                      {c.isClient && (
                        <span className="rounded bg-[#e0f2fe] px-1.5 py-0.5 text-[10px] text-[#0369a1]">
                          Cliente
                        </span>
                      )}
                      <span>· {relative(c.createdAt)}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm">{c.body}</div>
                    {c.authorId === user.id && (
                      <CommentActions commentId={c.id} body={c.body} />
                    )}
                  </div>
                </div>
              ))}
              {req.comments.length === 0 && (
                <div className="text-sm text-[#9ca3af]">
                  Aún no hay comentarios.
                </div>
              )}
            </div>
            <form action={addComment} className="mt-3 flex gap-2">
              <input type="hidden" name="requestId" value={req.id} />
              <input
                name="body"
                placeholder="Escribe un comentario para el cliente…"
                className={inputCls}
                required
              />
              <button className="shrink-0 rounded-lg bg-[#0bdbcf] px-4 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
                Comentar
              </button>
            </form>
          </section>
        </div>

        <aside className="w-80 shrink-0 space-y-4">
          <div className="rounded-xl border border-[#e6e8eb] bg-white p-4">
            <div className="space-y-3 text-sm">
              <Row label="Estado">
                <StatusSelect requestId={req.id} value={req.status} statuses={statuses} />
              </Row>
              <Row label="Responsable">
                <AssigneeSelect
                  requestId={req.id}
                  value={req.assigneeId}
                  users={users}
                />
              </Row>
              <Row label="Prioridad">
                <PrioritySelect requestId={req.id} value={req.priority} />
              </Row>
              <Row label="Tipo">
                <span>{req.type}</span>
              </Row>
              <Row label="Cliente">
                <span>{req.client.name}</span>
              </Row>
              <Row label="Proyecto">
                <span>{req.project?.name ?? "—"}</span>
              </Row>
              <Row label="Solicitante">
                <span className="truncate">{req.requesterEmail || "—"}</span>
              </Row>
              <Row label="Prioridad cliente">
                <span>{req.clientPriority ? `${req.clientPriority}/5` : "—"}</span>
              </Row>
              <Row label="Fecha límite">
                <span>{longDate(req.dueDate)}</span>
              </Row>
              <Row label="Creada">
                <span>{longDate(req.createdAt)}</span>
              </Row>
            </div>
          </div>

          <div className="rounded-xl border border-[#e6e8eb] bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold">Colaboradores</h3>
            <p className="mb-2 text-[11px] text-[#9aa5ad]">
              Además del responsable principal, también pueden actuar sobre
              esta tarea.
            </p>
            <CollaboratorsPanel
              requestId={req.id}
              collaborators={req.collaborators.map((c) => ({
                id: c.user.id,
                name: c.user.name,
                color: c.user.color,
              }))}
              users={users}
            />
          </div>

          <div className="rounded-xl border border-[#e6e8eb] bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Horas</h3>
              <span className="text-sm font-semibold text-[#08a89f]">
                {hoursLabel(totalHours)}
              </span>
            </div>
            <div className="space-y-1.5">
              {req.timeEntries.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="flex items-center gap-1.5">
                    <Avatar name={t.user.name} color={t.user.color} size={18} />
                    {t.user.name}
                  </span>
                  <span className="text-[#6b7280]">
                    {hoursLabel(t.hours)} · {shortDate(t.date)}
                  </span>
                </div>
              ))}
              {req.timeEntries.length === 0 && (
                <div className="text-xs text-[#9ca3af]">
                  Sin horas cargadas.
                </div>
              )}
            </div>
            <form action={logHours} className="mt-3 space-y-2">
              <input type="hidden" name="requestId" value={req.id} />
              <div className="flex gap-2">
                <input
                  name="hours"
                  type="number"
                  step="0.25"
                  min="0"
                  placeholder="Horas"
                  className={inputCls}
                  required
                />
                <input name="date" type="date" className={inputCls} />
              </div>
              <input
                name="note"
                placeholder="Detalle (opcional)"
                className={inputCls}
              />
              <button className="w-full rounded-lg border border-[#e6e8eb] py-2 text-sm hover:bg-[#f3f4f6]">
                Cargar horas
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-[#e6e8eb] bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold">Actividad</h3>
            <div className="space-y-2">
              {req.activities.slice(0, 12).map((a) => (
                <div key={a.id} className="text-xs text-[#6b7280]">
                  <span className="font-medium text-[#374151]">
                    {a.actorName}
                  </span>{" "}
                  {a.message}
                  <span className="text-[#9ca3af]">
                    {" "}
                    · {relative(a.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[#6b7280]">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
