import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Rmap #6 — vista de solo lectura sobre AuditLog (login/logout, cambios de
// contraseña, y toda mutación admin_*). Sin paginación a propósito (Rec.
// #68 sigue pendiente aparte): con el volumen actual, los últimos 300
// alcanzan de sobra.
export default async function AdminAuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; q?: string }>;
}) {
  const { tipo, q } = await searchParams;
  const [logs, tipos] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(tipo ? { type: tipo } : {}),
        ...(q
          ? { actorEmail: { contains: q, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.auditLog.findMany({
      distinct: ["type"],
      select: { type: true },
      orderBy: { type: "asc" },
    }),
  ]);

  return (
    <div className="p-6">
      <p className="mb-4 text-sm text-[#6b7280]">
        Bitácora de seguridad — login, cambios de contraseña, y toda
        acción de administración. Últimos 300 eventos.
      </p>

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <select
          name="tipo"
          defaultValue={tipo || ""}
          className="h-9 rounded-md border border-[#e4e8ec] bg-white px-2 text-sm"
        >
          <option value="">Todos los tipos</option>
          {tipos.map((t) => (
            <option key={t.type} value={t.type}>
              {t.type}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={q || ""}
          placeholder="Buscar por correo…"
          className="h-9 flex-1 min-w-[180px] rounded-md border border-[#e4e8ec] bg-white px-2 text-sm"
        />
        <button className="h-9 rounded-md bg-[#0bdbcf] px-3 text-xs font-semibold text-[#081826]">
          Filtrar
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-[#e6e8eb] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e6e8eb] text-left text-xs text-[#6b7280]">
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Tipo</th>
              <th className="px-4 py-2.5 font-medium">Quién</th>
              <th className="px-4 py-2.5 font-medium">IP</th>
              <th className="px-4 py-2.5 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-[#f3f4f6] last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 text-[#6b7280]">
                  {l.createdAt.toLocaleString("es-CL")}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{l.type}</td>
                <td className="px-4 py-2.5 text-[#6b7280]">{l.actorEmail || "—"}</td>
                <td className="px-4 py-2.5 text-[#6b7280]">{l.ip || "—"}</td>
                <td className="px-4 py-2.5 text-[#6b7280]">{l.detail || "—"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[#6b7280]">
                  No hay eventos que coincidan con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
