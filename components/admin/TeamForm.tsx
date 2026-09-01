import Link from "next/link";
import { ROLE_MAP } from "@/lib/constants";
import { SubmitButton } from "@/components/SubmitButton";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";
const labelCls = "mb-1 block text-xs font-semibold text-[#5d6b77]";

const ERROR_MESSAGES: Record<string, string> = {
  nombre: "El nombre del equipo es obligatorio.",
};

export function TeamForm({
  team,
  users,
  error,
  action,
  submitLabel,
}: {
  team?: { id: string; name: string; color: string | null };
  users: { id: string; name: string; role: string; teamId: string | null }[];
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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Nombre del equipo *</label>
          <input name="name" required defaultValue={team?.name} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Color</label>
          <input
            name="color"
            type="color"
            defaultValue={team?.color || "#08a89f"}
            className="h-9 w-full rounded-lg border border-[#e4e8ec]"
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>Miembros</label>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-[#e4e8ec] p-3">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="memberIds"
                value={u.id}
                defaultChecked={team ? u.teamId === team.id : false}
                className="h-4 w-4 accent-[#0bdbcf]"
              />
              {u.name}{" "}
              <span className="text-xs text-[#9aa5ad]">
                · {ROLE_MAP[u.role]?.label ?? u.role}
              </span>
            </label>
          ))}
          {users.length === 0 && (
            <p className="text-xs text-[#9aa5ad]">Aún no hay usuarios creados.</p>
          )}
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <SubmitButton className="rounded-md bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
          {submitLabel}
        </SubmitButton>
        <Link
          href="/admin/equipos"
          className="rounded-md border border-[#e4e8ec] px-4 py-2 text-sm text-[#5d6b77] hover:bg-[#f8fafb]"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
