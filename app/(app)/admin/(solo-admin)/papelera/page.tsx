import { prisma } from "@/lib/db";
import { restoreRequest } from "@/app/actions";
import { ClientTag } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Solicitudes enviadas a la papelera (creadas por error). Las subtareas
// que se fueron junto con su padre no se listan sueltas: vuelven al
// restaurar el padre.
export default async function AdminPapeleraPage() {
  const items = await prisma.request.findMany({
    where: {
      deletedAt: { not: null },
      OR: [{ parentId: null }, { parent: { deletedAt: null } }],
    },
    include: {
      client: { select: { name: true, isActive: true } },
      parent: { select: { key: true } },
      subtasks: { where: { deletedAt: { not: null } }, select: { deletedAt: true } },
    },
    orderBy: { deletedAt: "desc" },
    take: 300,
  });

  return (
    <div className="p-6">
      <p className="mb-4 text-sm text-[#6b7280]">
        Solicitudes eliminadas por error. No aparecen en ninguna vista ni
        reporte; al restaurarlas vuelven con sus subtareas.
      </p>
      <div className="overflow-hidden rounded-xl border border-[#e6e8eb] bg-white">
        {items.map((r) => {
          const withIt = r.subtasks.filter((s) => s.deletedAt?.getTime() === r.deletedAt?.getTime()).length;
          return (
            <div
              key={r.id}
              className="flex items-center gap-3 border-b border-[#f0f1f3] px-4 py-3 text-sm last:border-0"
            >
              <ClientTag name={r.client.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  <span className="text-xs text-[#6b7280]">{r.key}</span> {r.title}
                </div>
                <div className="text-xs text-[#6b7280]">
                  Eliminada {shortDate(r.deletedAt)} por {r.deletedByName ?? "—"}
                  {r.parent && ` · subtarea de ${r.parent.key}`}
                  {withIt > 0 && ` · con ${withIt} subtarea${withIt === 1 ? "" : "s"}`}
                </div>
              </div>
              {r.client.isActive ? (
                <form action={restoreRequest.bind(null, r.id)}>
                  <SubmitButton
                    pendingLabel="…"
                    className="rounded-lg border border-[#e6e8eb] px-3 py-1.5 text-xs font-semibold hover:bg-[#f3f4f6]"
                  >
                    Restaurar
                  </SubmitButton>
                </form>
              ) : (
                <span className="text-xs text-[#9ca3af]">Cliente archivado</span>
              )}
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="px-4 py-6 text-sm text-[#6b7280]">La papelera está vacía.</div>
        )}
      </div>
    </div>
  );
}
