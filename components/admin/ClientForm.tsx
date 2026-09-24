import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { toDateInput } from "@/lib/dates";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";
const labelCls = "mb-1 block text-xs font-semibold text-[#5d6b77]";

const ERROR_MESSAGES: Record<string, string> = {
  nombre: "El nombre del cliente es obligatorio.",
  codigo_existente: "Ese código ya lo usa otro cliente — prueba con otro, o déjalo vacío para que se genere solo.",
};

export function ClientForm({
  client,
  managers,
  teamUsers,
  memberIds,
  error,
  action,
  submitLabel,
}: {
  client?: {
    name: string;
    code: string | null;
    contactEmail: string | null;
    contractedHours: number;
    cycleMonths: number;
    carryoverMonths: number;
    cycleStartDate: Date | null;
    createdAt: Date;
    color: string | null;
    accountManagerId: string | null;
    isActive: boolean;
  };
  managers: { id: string; name: string }[];
  // Equipo interno asignable al cliente y quiénes ya están asignados.
  teamUsers: { id: string; name: string }[];
  memberIds?: string[];
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
          <input name="code" defaultValue={client?.code ?? ""} placeholder="Se genera solo si lo dejas vacío" className={inputCls} />
          <p className="mt-1 text-[11px] text-[#6b7280]">
            Prefijo de sus folios (ej. ACHS-1, ACHS-2…). Único entre clientes.
          </p>
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
          <label className={labelCls}>Horas por ciclo</label>
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
          <label className={labelCls}>Se renueva cada</label>
          <select
            name="cycleMonths"
            defaultValue={String(client?.cycleMonths ?? 1)}
            className={inputCls}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "mes" : "meses"}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Arrastre de horas sobrantes</label>
        <input
          name="carryoverMonths"
          type="number"
          min="0"
          step="1"
          defaultValue={client?.carryoverMonths ?? 0}
          className={`${inputCls} w-32`}
        />
        <p className="mt-1 text-[11px] text-[#6b7280]">
          Meses siguientes en que se pueden usar las horas que sobren de cada ciclo. 0 = sin arrastre.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Inicio del contrato</label>
          <input
            name="cycleStartDate"
            type="date"
            defaultValue={toDateInput(client?.cycleStartDate ?? client?.createdAt ?? new Date())}
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-[#6b7280]">
            Ancla del ciclo — desde acá se cuentan las renovaciones automáticas.
          </p>
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
      <div>
        <label className={labelCls}>Equipo asignado al cliente</label>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[#e4e8ec] p-3">
          {teamUsers.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="memberIds"
                value={u.id}
                defaultChecked={memberIds?.includes(u.id) ?? false}
                className="h-4 w-4 accent-[#0bdbcf]"
              />
              {u.name}
            </label>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-[#6b7280]">
          Aparecen como «Tu equipo» en el portal del cliente, reciben las alertas de bolsa de horas y, si su rol
          tiene alcance «Solo sus clientes», ven las solicitudes de este cliente.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={client?.isActive ?? true}
          className="h-4 w-4 accent-[#0bdbcf]"
        />
        Cliente activo · desmarcar lo archiva: finaliza y archiva sus tareas, cierra sus proyectos y desactiva sus usuarios de portal
      </label>
      <div className="flex gap-2 pt-2">
        <SubmitButton className="rounded-md bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
          {submitLabel}
        </SubmitButton>
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
