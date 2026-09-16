import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { updateRolePermissions } from "@/app/actions";
import { ACTIONS, SCOPES } from "@/lib/permissions";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const selectCls =
  "w-full rounded-lg border border-[#e4e8ec] bg-white px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function EditarRolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const role = await prisma.role.findUnique({
    where: { id },
    include: { permissions: true },
  });
  if (!role) notFound();

  const scopeByAction: Record<string, string> = Object.fromEntries(
    role.permissions.map((p) => [p.action, p.scope]),
  );

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2 text-sm text-[#6b7280]">
        <Link href="/admin/roles" className="text-[#08a89f] hover:underline">
          Roles
        </Link>
        <span>/</span>
        <span className="font-medium text-[#141413]">{role.name}</span>
      </div>

      <form
        action={updateRolePermissions.bind(null, role.id)}
        className="max-w-2xl space-y-4"
      >
        <div className="rounded-xl border border-[#e6e8eb] bg-white p-4">
          <label className="mb-1 block text-xs font-semibold text-[#6b7280]">
            Nombre del rol
          </label>
          <input
            name="name"
            defaultValue={role.name}
            required
            className="w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-[#e6e8eb] bg-white">
          <div className="grid grid-cols-[minmax(0,2fr)_10rem] gap-x-4 border-b border-[#e6e8eb] px-4 py-2.5 text-left text-xs font-medium text-[#6b7280]">
            <div>Acción</div>
            <div>Alcance</div>
          </div>
          {ACTIONS.map((a) => (
            <div
              key={a.key}
              className="grid grid-cols-[minmax(0,2fr)_10rem] items-center gap-x-4 border-b border-[#f3f4f6] px-4 py-2.5 text-sm last:border-0"
            >
              <div>{a.label}</div>
              <select
                name={`scope__${a.key}`}
                defaultValue={scopeByAction[a.key] ?? "none"}
                className={selectCls}
              >
                {SCOPES.filter((s) => a.scopes.includes(s.key)).map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <SubmitButton className="rounded-md bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
            Guardar permisos
          </SubmitButton>
          <Link
            href="/admin/roles"
            className="rounded-md border border-[#e4e8ec] px-4 py-2 text-sm text-[#5d6b77] hover:bg-[#f8fafb]"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
