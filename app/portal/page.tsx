import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { getPortalSession } from "@/lib/portal";
import {
  portalLogin,
  portalLogout,
  submitClientRequest,
} from "@/app/actions";
import { StatusBadge, PriorityTag } from "@/components/ui";
import { REQUEST_TYPES, PRIORITIES } from "@/lib/constants";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; email?: string }>;
}) {
  const { ok, error, email: attemptedEmail } = await searchParams;
  const session = await getPortalSession();

  if (!session) {
    return (
      <div className="flex min-h-screen">
        <div className="relative hidden overflow-hidden lg:flex lg:w-1/2">
          <Image
            src="/brand/gradiente-2.png"
            fill
            className="object-cover"
            alt=""
            priority
          />
          <div className="relative z-10 flex w-full flex-col justify-between p-12">
            <Image
              src="/brand/logo-blanco.png"
              width={150}
              height={67}
              alt="REVO"
            />
            <div>
              <div className="font-brand text-2xl font-bold text-white">
                Portal del cliente
              </div>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/85">
                Ingresa tus solicitudes, sigue su estado y conversa con el
                equipo, todo en un solo lugar.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center bg-[#f4f6f8] p-6">
          <form
            action={portalLogin}
            className="w-full max-w-md rounded-2xl border border-[#e4e8ec] bg-white p-8"
          >
            <Image
              src="/brand/logo-bajada.png"
              width={190}
              height={84}
              alt="REVO Business Evolution"
              className="mx-auto mb-2"
            />
            <p className="mb-5 text-center text-sm text-[#5d6b77]">
              Ingresa con tu correo de empresa
            </p>
            {error === "desconocido" && (
              <div className="mb-4 rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
                No encontramos una empresa asociada a{" "}
                <span className="font-semibold">{attemptedEmail}</span>.
                Contacta a tu coordinador de cuenta en REVO.
              </div>
            )}
            {error === "invalido" && (
              <div className="mb-4 rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
                Ingresa un correo válido.
              </div>
            )}
            <label className="mb-1 block text-sm font-semibold">
              Tu correo
            </label>
            <input
              name="email"
              type="email"
              required
              placeholder="nombre@tuempresa.cl"
              className={inputCls}
            />
            <button className="mt-4 w-full rounded-lg bg-[#0bdbcf] py-2.5 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
              Ingresar al portal
            </button>
            <p className="mt-3 text-center text-xs text-[#7f7f7f]">
              Identificamos tu empresa automáticamente por el dominio del
              correo.
            </p>
          </form>
        </div>
      </div>
    );
  }

  const { email, client } = session;
  const requests = await prisma.request.findMany({
    where: { clientId: client.id },
    include: {
      attachments: { select: { id: true } },
      comments: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-[#f4f6f8]">
      <header className="border-b border-[#e4e8ec] bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/brand/logo.png" alt="REVO" width={96} height={43} />
            <div className="hidden h-8 w-px bg-[#e4e8ec] sm:block" />
            <div className="hidden sm:block">
              <div className="font-brand text-sm font-semibold">
                Portal del cliente
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold">{client.name}</div>
              <div className="text-xs text-[#5d6b77]">{email}</div>
            </div>
            <form action={portalLogout}>
              <button className="rounded-lg border border-[#e4e8ec] px-3 py-1.5 text-xs text-[#5d6b77] hover:bg-[#f4f6f8]">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        {ok && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-[#0bdbcf] bg-[#e0fbf9] px-4 py-3 text-sm text-[#065f5a]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0bdbcf] text-xs font-bold text-[#081826]">
              ✓
            </span>
            Solicitud <span className="font-semibold">{ok}</span> ingresada.
            Te confirmamos por correo y te avisaremos cada cambio de estado.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(320px,380px)_1fr] lg:items-start">
          <section className="rounded-2xl border border-[#e4e8ec] bg-white p-5 lg:sticky lg:top-6">
            <h2 className="font-brand text-sm font-semibold">
              Nueva solicitud
            </h2>
            <p className="mb-4 mt-1 text-xs text-[#5d6b77]">
              Solicitud para {client.name} · se registrará con la fecha de hoy
              y tu correo.
            </p>
            <form action={submitClientRequest} className="space-y-3">
              <Field label="Tipo de solicitud">
                <select name="type" className={inputCls} defaultValue={REQUEST_TYPES[0]}>
                  {REQUEST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Descripción">
                <textarea
                  name="description"
                  rows={4}
                  required
                  placeholder="Cuéntanos qué necesitas…"
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prioridad">
                  <select name="priority" className={inputCls} defaultValue="MEDIA">
                    {PRIORITIES.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Fecha de entrega">
                  <input name="dueDate" type="date" className={inputCls} />
                </Field>
              </div>
              <Field label="Archivo adjunto (PDF, PNG, JPG)">
                <input
                  type="file"
                  name="file"
                  accept=".pdf,.png,.jpg,.jpeg,.gif"
                  className="w-full text-sm text-[#5d6b77] file:mr-3 file:rounded-lg file:border-0 file:bg-[#e0fbf9] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#065f5a]"
                />
              </Field>
              <button className="w-full rounded-lg bg-[#0bdbcf] py-2.5 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
                Enviar solicitud
              </button>
            </form>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-brand text-sm font-semibold">
                Mis solicitudes
              </h2>
              <span className="text-xs text-[#5d6b77]">
                {requests.length} en total
              </span>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-[#e4e8ec] bg-white">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[#e4e8ec] text-left text-xs text-[#5d6b77]">
                    <th className="px-4 py-2.5 font-semibold">Solicitud</th>
                    <th className="px-4 py-2.5 font-semibold">Prioridad</th>
                    <th className="px-4 py-2.5 font-semibold">Ingreso</th>
                    <th className="px-4 py-2.5 font-semibold">Entrega</th>
                    <th className="px-4 py-2.5 font-semibold">Estado</th>
                    <th className="px-4 py-2.5 font-semibold">
                      <span className="sr-only">Comentarios</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-[#f1f3f4] last:border-0 hover:bg-[#f8fafb]"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/portal/solicitud/${r.key}`}
                          className="block"
                        >
                          <div className="flex items-center gap-2 text-xs text-[#7f7f7f]">
                            {r.key} · {r.type}
                            {r.requesterEmail === email && (
                              <span className="rounded bg-[#e0fbf9] px-1.5 py-0.5 text-[10px] font-semibold text-[#065f5a]">
                                tuya
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 line-clamp-1 font-semibold">
                            {r.title}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <PriorityTag priority={r.priority} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#5d6b77]">
                        {shortDate(r.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#5d6b77]">
                        {shortDate(r.dueDate)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/portal/solicitud/${r.key}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#e4e8ec] px-2.5 py-1.5 text-xs text-[#5d6b77] hover:border-[#0bdbcf] hover:text-[#065f5a]"
                        >
                          💬 {r.comments.length}
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {requests.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-sm text-[#7f7f7f]"
                      >
                        Aún no tienes solicitudes. Ingresa la primera con el
                        formulario.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-[#7f7f7f]">
              El estado lo actualiza el equipo REVO a medida que avanza tu
              solicitud. Haz clic en una solicitud para ver el detalle y
              conversar con el equipo.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-semibold">{label}</div>
      {children}
    </label>
  );
}
