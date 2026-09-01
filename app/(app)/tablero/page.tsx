import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requestVisibilityWhere } from "@/lib/authz";
import { STATUSES } from "@/lib/constants";
import { Avatar, PriorityTag, ClientTag } from "@/components/ui";
import { hoursLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TableroPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const requests = await prisma.request.findMany({
    where: { ...requestVisibilityWhere(user), archivedAt: null },
    include: {
      client: true,
      assignee: true,
      timeEntries: { select: { hours: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[#e6e8eb] bg-white px-6 py-3">
        <div>
          <div className="text-xs text-[#6b7280]">Espacio</div>
          <h1 className="font-brand text-base font-semibold">Mantención · Tablero</h1>
        </div>
        <Link
          href="/solicitar"
          target="_blank"
          className="rounded-lg bg-[#0bdbcf] px-3 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]"
        >
          + Nueva solicitud
        </Link>
      </header>

      <div className="thin-scroll flex flex-1 gap-4 overflow-x-auto p-6">
        {STATUSES.map((s) => {
          const items = requests.filter((r) => r.status === s.key);
          return (
            <div key={s.key} className="flex w-72 shrink-0 flex-col">
              <div className="mb-3 flex items-center gap-2">
                <span
                  style={{ background: s.color }}
                  className="h-2.5 w-2.5 rounded-full"
                />
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="rounded bg-[#f3f4f6] px-1.5 text-xs text-[#6b7280]">
                  {items.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {items.map((r) => {
                  const hrs = r.timeEntries.reduce((a, t) => a + t.hours, 0);
                  return (
                    <Link
                      key={r.id}
                      href={`/solicitudes/${r.key}`}
                      className="rounded-xl border border-[#e6e8eb] bg-white p-3 transition hover:border-[#0bdbcf] hover:shadow-sm"
                    >
                      <div className="mb-2 flex items-center gap-1.5">
                        <ClientTag name={r.client.code || r.client.name} />
                        <PriorityTag priority={r.priority} />
                      </div>
                      <div className="mb-2 text-sm leading-snug">{r.title}</div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#9ca3af]">{r.key}</span>
                        <div className="flex items-center gap-2">
                          {hrs > 0 && (
                            <span className="text-xs text-[#6b7280]">
                              {hoursLabel(hrs)}
                            </span>
                          )}
                          {r.assignee ? (
                            <Avatar
                              name={r.assignee.name}
                              color={r.assignee.color}
                              size={22}
                            />
                          ) : (
                            <span className="h-[22px] w-[22px] rounded-full border border-dashed border-[#d1d5db]" />
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {items.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#e6e8eb] p-3 text-center text-xs text-[#9ca3af]">
                    Sin tarjetas
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
