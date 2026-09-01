import { prisma } from "@/lib/db";
import { createStatus, updateStatus, setStatusActive } from "@/app/actions";
import { ActiveToggle } from "@/components/admin/ActiveToggle";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function AdminEstadosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const statuses = await prisma.status.findMany({
    orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }],
  });

  return (
    <div className="p-6">
      <p className="mb-4 text-sm text-[#6b7280]">
        Estados de solicitud — compartidos por todos los proyectos y
        tableros, se editan una vez y aplican a toda la plataforma. Marca
        "Estado final" en el (o los) estado que cierra una solicitud: define
        cuándo se calcula el SLA y cuándo deja de contar como "abierta".
      </p>

      {error && (
        <div className="mb-4 max-w-lg rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
          {error === "code_existente"
            ? "Ya existe un estado con ese código."
            : "El código y el nombre son obligatorios."}
        </div>
      )}

      <div className="mb-6 overflow-hidden rounded-xl border border-[#e6e8eb] bg-white">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_5.5rem_5rem_4rem_5.5rem_5.5rem] gap-x-2 border-b border-[#e6e8eb] px-4 py-2.5 text-left text-xs font-medium text-[#6b7280]">
          <div>Código</div>
          <div>Nombre</div>
          <div>Color</div>
          <div>Orden</div>
          <div>Final</div>
          <div>Estado</div>
          <div />
        </div>
        {statuses.map((s) => (
          <form
            key={s.id}
            action={updateStatus.bind(null, s.id)}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_5.5rem_5rem_4rem_5.5rem_5.5rem] items-center gap-x-2 border-b border-[#f3f4f6] px-4 py-2 text-sm last:border-0"
          >
            <div className="truncate font-mono text-xs text-[#9ca3af]">
              {s.code}
            </div>
            <input
              name="label"
              defaultValue={s.label}
              required
              className={inputCls}
            />
            <input
              name="color"
              type="color"
              defaultValue={s.color}
              className="h-8 w-14 rounded border border-[#e4e8ec]"
            />
            <input
              name="sortOrder"
              type="number"
              defaultValue={s.sortOrder}
              className={`${inputCls} w-16`}
            />
            <input
              name="isFinal"
              type="checkbox"
              defaultChecked={s.isFinal}
              className="h-4 w-4 accent-[#0bdbcf]"
            />
            <ActiveToggle
              id={s.id}
              isActive={!s.archivedAt}
              action={setStatusActive}
            />
            <SubmitButton className="rounded-md border border-[#e4e8ec] px-3 py-1.5 text-xs hover:bg-[#f3f4f6]">
              Guardar
            </SubmitButton>
          </form>
        ))}
        {statuses.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-[#9ca3af]">
            Aún no hay estados creados.
          </div>
        )}
      </div>

      <form
        action={createStatus}
        className="max-w-lg space-y-3 rounded-xl border border-[#e6e8eb] bg-white p-4"
      >
        <h2 className="text-sm font-semibold">Nuevo estado</h2>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b7280]">
            Código
          </label>
          <input
            name="code"
            placeholder="EN_REVISION"
            required
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-[#9ca3af]">
            Identificador interno, sin espacios. Se normaliza en mayúsculas.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b7280]">
            Nombre
          </label>
          <input name="label" placeholder="En revisión" required className={inputCls} />
        </div>
        <div className="flex gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#6b7280]">
              Color
            </label>
            <input
              name="color"
              type="color"
              defaultValue="#7f7f7f"
              className="h-9 w-16 rounded border border-[#e4e8ec]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#6b7280]">
              Orden
            </label>
            <input
              name="sortOrder"
              type="number"
              className={`${inputCls} w-20`}
            />
          </div>
          <label className="mt-6 flex items-center gap-1.5 text-xs text-[#6b7280]">
            <input
              name="isFinal"
              type="checkbox"
              className="h-4 w-4 accent-[#0bdbcf]"
            />
            Estado final
          </label>
        </div>
        <SubmitButton className="rounded-md bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
          Crear estado
        </SubmitButton>
      </form>
    </div>
  );
}
