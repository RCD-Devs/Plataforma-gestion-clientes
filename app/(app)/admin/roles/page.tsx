import Link from "next/link";
import { prisma } from "@/lib/db";
import { createRole, setRoleActive } from "@/app/actions";
import { ActiveToggle } from "@/components/admin/ActiveToggle";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function AdminRolesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const roles = await prisma.role.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
  });

  return (
    <div className="p-6">
      <p className="mb-4 text-sm text-[#6b7280]">
        Roles de equipo y sus permisos — quién puede ver o hacer qué dentro
        de la plataforma. El rol Cliente no está acá: sigue siendo la
        cuenta del portal, no un rol de equipo.
      </p>

      {error && (
        <div className="mb-4 max-w-lg rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
          {error === "code_existente"
            ? "Ya existe un rol con ese nombre."
            : "El nombre es obligatorio."}
        </div>
      )}

      <div className="mb-6 overflow-hidden rounded-xl border border-[#e6e8eb] bg-white">
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_5rem_5.5rem_5.5rem] gap-x-2 border-b border-[#e6e8eb] px-4 py-2.5 text-left text-xs font-medium text-[#6b7280]">
          <div>Rol</div>
          <div>Código</div>
          <div>Personas</div>
          <div>Estado</div>
          <div />
        </div>
        {roles.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_5rem_5.5rem_5.5rem] items-center gap-x-2 border-b border-[#f3f4f6] px-4 py-2.5 text-sm last:border-0"
          >
            <div className="font-medium">
              {r.name}
              {r.isSystem && (
                <span className="ml-1.5 rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-semibold text-[#6b7280]">
                  del sistema
                </span>
              )}
            </div>
            <div className="truncate font-mono text-xs text-[#6b7280]">{r.code}</div>
            <div className="text-[#6b7280]">{r._count.users}</div>
            <ActiveToggle id={r.id} isActive={!r.archivedAt} action={setRoleActive} />
            <Link
              href={`/admin/roles/${r.id}`}
              className="text-right text-xs font-semibold text-[#08a89f] hover:underline"
            >
              Permisos
            </Link>
          </div>
        ))}
        {roles.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-[#6b7280]">
            Aún no hay roles creados.
          </div>
        )}
      </div>

      <form
        action={createRole}
        className="max-w-lg space-y-3 rounded-xl border border-[#e6e8eb] bg-white p-4"
      >
        <h2 className="text-sm font-semibold">Nuevo rol</h2>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b7280]">
            Nombre
          </label>
          <input name="name" placeholder="Soporte Nivel 1" required className={inputCls} />
          <p className="mt-1 text-[11px] text-[#6b7280]">
            Sin permisos otorgados al crearlo — se asignan después, en su
            propia página.
          </p>
        </div>
        <SubmitButton className="rounded-md bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
          Crear rol
        </SubmitButton>
      </form>
    </div>
  );
}
