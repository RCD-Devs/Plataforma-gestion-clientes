import Link from "next/link";
import { prisma } from "@/lib/db";
import { PriorityTag } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { PortalShell, shellProps } from "@/components/portal/PortalShell";
import { requirePortalUser } from "@/lib/portal";
import { shortDate } from "@/lib/format";
import { getStatuses } from "@/lib/statuses";

export const dynamic = "force-dynamic";

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    estado?: string;
    proyecto?: string;
    mias?: string;
  }>;
}) {
  const { ok, estado, proyecto, mias } = await searchParams;
  const ctx = await requirePortalUser();
  const { client, email } = ctx;
  const filtered = Boolean(estado || proyecto || mias);

  const [requests, statuses, projects] = await Promise.all([
    prisma.request.findMany({
      where: {
        clientId: client.id,
        ...(estado && { status: estado }),
        ...(proyecto && {
          project: { OR: [{ slug: proyecto }, { id: proyecto }] },
        }),
        ...(mias && { requesterEmail: email }),
      },
      include: {
        attachments: { select: { id: true } },
        comments: { where: { isInternal: false }, select: { id: true } },
        project: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getStatuses(),
    prisma.project.findMany({
      where: { clientId: client.id, archivedAt: null },
      select: { id: true, slug: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const cls =
    "h-8 rounded-md border border-[#e4e8ec] bg-white px-2 text-sm text-[#374151] outline-none focus:border-[#0bdbcf]";

  return (
    <PortalShell {...shellProps(ctx)}>
      {ok && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-[#0bdbcf] bg-[#e0fbf9] px-4 py-3 text-sm text-[#065f5a]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0bdbcf] text-xs font-bold text-[#081826]">
            ✓
          </span>
          Solicitud <span className="font-semibold">{ok}</span> ingresada. Te
          confirmamos por correo y te avisaremos cada cambio de estado.
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h1 className="font-brand text-sm font-semibold">Mis solicitudes</h1>
        <span className="text-xs text-[#5d6b77]">
          {requests.length} en total
        </span>
      </div>
      {/* GET nativo: los filtros quedan en la URL, sin JS. */}
      <form className="mb-3 flex flex-wrap items-center gap-2">
        <select name="estado" defaultValue={estado ?? ""} className={cls}>
          <option value="">Estado</option>
          {statuses.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
        {projects.length > 0 && (
          <select name="proyecto" defaultValue={proyecto ?? ""} className={cls}>
            <option value="">Proyecto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.slug ?? p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1 text-xs text-[#5d6b77]">
          <input
            type="checkbox"
            name="mias"
            value="1"
            defaultChecked={Boolean(mias)}
            className="h-3.5 w-3.5 accent-[#0bdbcf]"
          />
          Solo las mías
        </label>
        <button className="h-8 rounded-md bg-[#081826] px-3 text-xs font-semibold text-white">
          Filtrar
        </button>
        {filtered && (
          <Link
            href="/portal/solicitudes"
            className="text-xs text-[#08a89f] hover:underline"
          >
            Limpiar
          </Link>
        )}
      </form>
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
                  <Link href={`/portal/solicitud/${r.key}`} className="block">
                    <div className="flex items-center gap-2 text-xs text-[#7f7f7f]">
                      {r.key} · {r.type}
                      {r.project && (
                        <span className="rounded bg-[#f1f3f4] px-1.5 py-0.5 text-[10px] font-semibold text-[#5d6b77]">
                          {r.project.name}
                        </span>
                      )}
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
                  {filtered ? (
                    "No hay solicitudes con esos filtros."
                  ) : (
                    <>
                      Aún no tienes solicitudes.{" "}
                      <Link
                        href="/portal/nueva"
                        className="text-[#08a89f] hover:underline"
                      >
                        Ingresa la primera
                      </Link>
                      .
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[#7f7f7f]">
        El estado lo actualiza el equipo REVO a medida que avanza tu solicitud.
        Haz clic en una solicitud para ver el detalle y conversar con el equipo.
      </p>
    </PortalShell>
  );
}
