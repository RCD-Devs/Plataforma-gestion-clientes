import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { addComment, logout } from "@/app/actions";
import { StatusBadge, PriorityTag } from "@/components/ui";
import { ClientPriorityStars } from "@/components/controls";
import { longDate, relative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalRequestDetail({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== "CLIENTE" || !user.client) redirect("/portal");
  if (user.mustChangePassword) redirect("/cambiar-clave");
  const email = user.email;
  const client = user.client;

  const req = await prisma.request.findUnique({
    where: { key },
    include: {
      attachments: { orderBy: { createdAt: "desc" } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!req || req.clientId !== client.id) notFound();

  return (
    <div className="min-h-screen bg-[#f4f6f8]">
      <header className="border-b border-[#e4e8ec] bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/portal">
              <Image src="/brand/logo.png" alt="REVO" width={96} height={43} />
            </Link>
            <div className="hidden h-8 w-px bg-[#e4e8ec] sm:block" />
            <div className="hidden font-brand text-sm font-semibold sm:block">
              Portal del cliente
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold">{client.name}</div>
              <div className="text-xs text-[#5d6b77]">{email}</div>
            </div>
            <form action={logout}>
              <button className="rounded-lg border border-[#e4e8ec] px-3 py-1.5 text-xs text-[#5d6b77] hover:bg-[#f4f6f8]">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        <Link
          href="/portal"
          className="text-sm text-[#08a89f] hover:underline"
        >
          ← Mis solicitudes
        </Link>

        <div className="mt-3 rounded-2xl border border-[#e4e8ec] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs text-[#7f7f7f]">
                {req.key} · {req.type}
              </div>
              <h1 className="mt-0.5 text-lg font-semibold">{req.title}</h1>
            </div>
            <StatusBadge status={req.status} />
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Spec label="Prioridad">
              <PriorityTag priority={req.priority} />
            </Spec>
            <Spec label="Fecha de ingreso">{longDate(req.createdAt)}</Spec>
            <Spec label="Fecha de entrega">{longDate(req.dueDate)}</Spec>
            <Spec label="Ingresada por">{req.requesterEmail || "—"}</Spec>
          </div>

          <div className="mt-4 border-t border-[#f1f3f4] pt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#7f7f7f]">
              Tu prioridad (1 a 5)
            </div>
            <div className="mt-1 flex items-center gap-2">
              <ClientPriorityStars
                requestId={req.id}
                value={req.clientPriority}
              />
              <span className="text-xs text-[#7f7f7f]">
                Ordena tus solicitudes según urgencia — el equipo lo verá al
                instante.
              </span>
            </div>
          </div>

          <div className="mt-4 border-t border-[#f1f3f4] pt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#7f7f7f]">
              Descripción
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">
              {req.description || "—"}
            </p>
          </div>

          {req.attachments.length > 0 && (
            <div className="mt-4 border-t border-[#f1f3f4] pt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7f7f7f]">
                Adjuntos
              </div>
              <div className="flex flex-wrap gap-2">
                {req.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    className="inline-flex items-center gap-2 rounded-lg border border-[#e4e8ec] px-3 py-1.5 text-sm hover:border-[#0bdbcf]"
                  >
                    <span className="rounded bg-[#f1f3f4] px-1.5 py-0.5 text-[10px] font-semibold text-[#5d6b77]">
                      {a.kind === "pdf"
                        ? "PDF"
                        : a.kind === "png"
                          ? "IMG"
                          : a.kind === "url"
                            ? "URL"
                            : "FILE"}
                    </span>
                    <span className="max-w-56 truncate">{a.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-[#e4e8ec] bg-white p-5">
          <h2 className="font-brand text-sm font-semibold">Conversación</h2>
          <p className="mb-4 mt-1 text-xs text-[#5d6b77]">
            Deja tu feedback o resuelve dudas directamente con el equipo REVO.
          </p>

          <div className="space-y-3">
            {req.comments.map((c) => (
              <div
                key={c.id}
                className={`flex ${c.isClient ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm sm:max-w-[70%] ${
                    c.isClient
                      ? "rounded-br-md bg-[#e0fbf9] text-[#06413d]"
                      : "rounded-bl-md border border-[#e4e8ec] bg-[#f8fafb] text-[#081826]"
                  }`}
                >
                  <div
                    className={`mb-0.5 text-[11px] font-semibold ${
                      c.isClient ? "text-[#08a89f]" : "text-[#5d6b77]"
                    }`}
                  >
                    {c.isClient ? c.authorName || "Tú" : `${c.authorName} · REVO`}
                  </div>
                  <div className="whitespace-pre-wrap">{c.body}</div>
                  <div
                    className={`mt-1 text-[10px] ${
                      c.isClient ? "text-[#08a89f]/70" : "text-[#6b7280]"
                    }`}
                  >
                    {relative(c.createdAt)}
                  </div>
                </div>
              </div>
            ))}
            {req.comments.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#e4e8ec] px-4 py-6 text-center text-sm text-[#7f7f7f]">
                Aún no hay mensajes. Escribe el primero.
              </div>
            )}
          </div>

          <form action={addComment} className="mt-4 flex gap-2">
            <input type="hidden" name="requestId" value={req.id} />
            <input type="hidden" name="isClient" value="1" />
            <input
              name="body"
              required
              placeholder="Escribe un mensaje para el equipo…"
              className="w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]"
            />
            <button className="shrink-0 rounded-lg bg-[#0bdbcf] px-4 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
              Enviar
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

function Spec({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-[#7f7f7f]">
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
