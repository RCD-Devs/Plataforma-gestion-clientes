import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasAccess, clientScopeWhere } from "@/lib/permissions";
import { createNewProject } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";
const labelCls = "mb-1 block text-xs font-semibold text-[#5d6b77]";

const ERRORS: Record<string, string> = {
  cliente: "Selecciona el cliente del proyecto.",
  nombre: "El nombre del proyecto es obligatorio.",
  fechas: "La fecha de término no puede ser anterior a la de inicio.",
};

export default async function NuevoProyectoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; cliente?: string }>;
}) {
  const { error, cliente } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasAccess(user.capabilities, "projects.manage")) redirect("/proyectos");
  const canBudget = hasAccess(user.capabilities, "projects.budget");

  const clients = await prisma.client.findMany({
    where: { isActive: true, ...clientScopeWhere(user.capabilities, "projects.manage", user.id) },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e4e8ec] bg-white px-6 py-3">
        <Link href="/proyectos" className="text-xs text-[#5d6b77] hover:underline">
          ← Proyectos
        </Link>
        <h1 className="mt-1 font-brand text-base font-semibold">Nuevo proyecto</h1>
      </header>

      <form action={createNewProject} className="max-w-xl flex-1 space-y-4 overflow-y-auto p-6">
        {error && ERRORS[error] && (
          <div className="rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
            {ERRORS[error]}
          </div>
        )}
        <div>
          <label className={labelCls}>Cliente *</label>
          <select name="clientId" required defaultValue={cliente ?? ""} className={inputCls}>
            <option value="" disabled>
              Selecciona…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Nombre del proyecto o sitio *</label>
          <input name="name" required placeholder="Ej. Sitio corporativo" className={inputCls} />
        </div>

        {canBudget ? (
          <fieldset className="rounded-xl border border-[#e4e8ec] p-4">
            <legend className="px-1 text-xs font-semibold text-[#5d6b77]">Cubicación estimada (opcional)</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Inicio</label>
                <input name="startDate" type="date" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Término</label>
                <input name="endDate" type="date" className={inputCls} />
              </div>
            </div>
            <div className="mt-3 w-40">
              <label className={labelCls}>Horas estimadas</label>
              <input name="estimatedHours" type="number" min="0" step="0.5" className={inputCls} />
            </div>
            <p className="mt-3 text-[11px] text-[#7f7f7f]">
              Las etapas y la confirmación de la cubicación se hacen después, en la ficha del proyecto.
            </p>
          </fieldset>
        ) : (
          <p className="text-xs text-[#7f7f7f]">
            La cubicación (fechas y horas) la carga quien tenga ese permiso desde la ficha del proyecto.
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <SubmitButton className="rounded-md bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
            Crear proyecto
          </SubmitButton>
          <Link
            href="/proyectos"
            className="rounded-md border border-[#e4e8ec] px-4 py-2 text-sm text-[#5d6b77] hover:bg-[#f8fafb]"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
