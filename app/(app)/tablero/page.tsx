import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requestVisibilityWhere, canActOnRequest } from "@/lib/authz";
import { requestFilterWhere, filterOptions } from "@/lib/requestFilters";
import { Filters } from "@/components/Filters";
import { Board, type BoardCard } from "@/components/Board";

export const dynamic = "force-dynamic";

export default async function TableroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Sin ?archivadas: el tablero es para trabajo vivo.
  const sp = { ...(await searchParams), archivadas: undefined };

  const [requests, opts] = await Promise.all([
    prisma.request.findMany({
      where: { AND: [requestVisibilityWhere(user), await requestFilterWhere(sp)] },
      include: {
        client: true,
        assignee: true,
        collaborators: true,
        timeEntries: { select: { hours: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    filterOptions(user),
  ]);

  const cards: BoardCard[] = requests.map((r) => ({
    id: r.id,
    key: r.key,
    title: r.title,
    status: r.status,
    priority: r.priority,
    hours: r.timeEntries.reduce((a, t) => a + t.hours, 0),
    clientLabel: r.client.code || r.client.name,
    assignee: r.assignee
      ? { name: r.assignee.name, color: r.assignee.color }
      : null,
    canDrag: canActOnRequest(user, r),
  }));

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e6e8eb] bg-white px-6 py-3">
        <div className="mb-3 flex items-center justify-between">
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
        </div>
        <Filters {...opts} hide={["archivadas"]} />
      </header>

      {/* key: Board copia `cards` a su propio estado; sin remontar, un filtro
          nuevo no se vería. */}
      <Board key={JSON.stringify(sp)} statuses={opts.statuses} cards={cards} />
    </div>
  );
}
