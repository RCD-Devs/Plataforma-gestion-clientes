import Link from "next/link";
import { prisma } from "@/lib/db";
import { StatusBadge, PriorityTag } from "@/components/ui";
import { PortalShell } from "@/components/portal/PortalShell";
import { requirePortalUser } from "@/lib/portal";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const { ok } = await searchParams;
  const { client, email } = await requirePortalUser();

  const requests = await prisma.request.findMany({
    where: { clientId: client.id },
    include: {
      attachments: { select: { id: true } },
      comments: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <PortalShell clientName={client.name} email={email}>
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
        <span className="text-xs text-[#5d6b77]">{requests.length} en total</span>
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
                  <Link href={`/portal/solicitud/${r.key}`} className="block">
                    <div className="flex items-center gap-2 text-xs text-[#7f7f7f]">
                      {r.key} · {r.type}
                      {r.requesterEmail === email && (
                        <span className="rounded bg-[#e0fbf9] px-1.5 py-0.5 text-[10px] font-semibold text-[#065f5a]">
                          tuya
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 line-clamp-1 font-semibold">{r.title}</div>
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
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#7f7f7f]">
                  Aún no tienes solicitudes.{" "}
                  <Link href="/portal/nueva" className="text-[#08a89f] hover:underline">
                    Ingresa la primera
                  </Link>
                  .
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
