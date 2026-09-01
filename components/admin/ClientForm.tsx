import Link from "next/link";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";
const labelCls = "mb-1 block text-xs font-semibold text-[#5d6b77]";

const ERROR_MESSAGES: Record<string, string> = {
  nombre: "El nombre del cliente es obligatorio.",
};

export function ClientForm({
  client,
  managers,
  error,
  action,
  submitLabel,
}: {
  client?: {
    name: string;
    code: string | null;
    contactEmail: string | null;
    contractedHours: number;
    color: string | null;
    accountManagerId: string | null;
    isActive: boolean;
  };
  managers: { id: string; name: string }[];
  error?: string;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="max-w-xl space-y-4 p-6">
      {error && (
        <div className="rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
          {ERROR_MESSAGES[error] || "No se pudo guardar. Revisa los datos."}
        </div>
      )}
      <div>
        <label className={labelCls}>Nombre del cliente *</label>
        <input
          name="name"
          required
          defaultValue={client?.name}
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Código</label>
          <input name="code" defaultValue={client?.code ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Correo de contacto</label>
          <input
            name="contactEmail"
            type="email"
            defaultValue={client?.contactEmail ?? ""}
            className={inputCls}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Bolsa de horas contratada</label>
          <input
            name="contractedHours"
            type="number"
            min="0"
            step="0.5"
            defaultValue={client?.contractedHours ?? 0}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Color</label>
          <input
            name="color"
            type="color"
            defaultValue={client?.color || "#08a89f"}
            className="h-9 w-full rounded-lg border border-[#e4e8ec]"
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>Coordinador de cuenta</label>
        <select
          name="accountManagerId"
          defaultValue={client?.accountManagerId ?? ""}
          className={inputCls}
        >
          <option value="">Sin asignar</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={client?.isActive ?? true}
          className="h-4 w-4 accent-[#0bdbcf]"
        />
        Cliente activo (visible en el formulario público de solicitudes)
      </label>
      <div className="flex gap-2 pt-2">
        <button className="rounded-md bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
          {submitLabel}
        </button>
        <Link
          href="/admin/clientes"
          className="rounded-md border border-[#e4e8ec] px-4 py-2 text-sm text-[#5d6b77] hover:bg-[#f8fafb]"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
