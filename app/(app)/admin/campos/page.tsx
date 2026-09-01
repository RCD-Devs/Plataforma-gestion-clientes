import { prisma } from "@/lib/db";
import { createCustomField, setCustomFieldActive } from "@/app/actions";
import { ActiveToggle } from "@/components/admin/ActiveToggle";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

const FIELD_TYPES = [
  { value: "text", label: "Texto corto" },
  { value: "textarea", label: "Texto largo" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Lista (opciones)" },
  { value: "checkbox", label: "Sí/No" },
];

export default async function AdminCamposPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const fields = await prisma.customFieldDefinition.findMany({
    orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }],
  });

  return (
    <div className="p-6">
      <p className="mb-4 text-sm text-[#6b7280]">
        Campos personalizados — compartidos por todos los proyectos y clientes,
        se editan una vez y aplican a toda la plataforma.
      </p>

      <div className="mb-6 overflow-hidden rounded-xl border border-[#e6e8eb] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e6e8eb] text-left text-xs text-[#6b7280]">
              <th className="px-4 py-2.5 font-medium">Campo</th>
              <th className="px-4 py-2.5 font-medium">Tipo</th>
              <th className="px-4 py-2.5 font-medium">Opciones</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id} className="border-b border-[#f3f4f6] last:border-0">
                <td className="px-4 py-3 font-medium">{f.label}</td>
                <td className="px-4 py-3 text-[#6b7280]">
                  {FIELD_TYPES.find((t) => t.value === f.type)?.label ?? f.type}
                </td>
                <td className="px-4 py-3 text-[#6b7280]">
                  {f.options.length > 0 ? f.options.join(", ") : "—"}
                </td>
                <td className="px-4 py-3">
                  <ActiveToggle
                    id={f.id}
                    isActive={!f.archivedAt}
                    action={setCustomFieldActive}
                  />
                </td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[#9ca3af]">
                  Aún no hay campos personalizados creados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="mb-4 max-w-lg rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
          El nombre del campo es obligatorio.
        </div>
      )}

      <form action={createCustomField} className="max-w-lg space-y-3 rounded-xl border border-[#e6e8eb] bg-white p-4">
        <h2 className="text-sm font-semibold">Nuevo campo</h2>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b7280]">Nombre</label>
          <input name="label" required className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b7280]">Tipo</label>
          <select name="type" defaultValue="text" className={inputCls}>
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b7280]">
            Opciones (solo si es "Lista", separadas por coma)
          </label>
          <input name="options" placeholder="Opción 1, Opción 2, Opción 3" className={inputCls} />
        </div>
        <SubmitButton className="rounded-md bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
          Crear campo
        </SubmitButton>
      </form>
    </div>
  );
}
