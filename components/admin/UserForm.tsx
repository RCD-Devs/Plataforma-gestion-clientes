import Link from "next/link";
import { ROLES } from "@/lib/constants";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";
const labelCls = "mb-1 block text-xs font-semibold text-[#5d6b77]";

const ERROR_MESSAGES: Record<string, string> = {
  datos: "Completa nombre, correo y rol.",
  email_existente: "Ya existe un usuario con ese correo.",
  cliente_requerido: "El rol Cliente necesita un cliente asociado.",
};

export function UserForm({
  editing,
  teams,
  clients,
  error,
  action,
  submitLabel,
}: {
  editing?: {
    name: string;
    email: string;
    role: string;
    color: string | null;
    teamId: string | null;
    clientId: string | null;
    isActive: boolean;
  };
  teams: { id: string; name: string }[];
  clients: { id: string; name: string }[];
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
      {!editing && (
        <p className="rounded-lg border border-[#e4e8ec] bg-[#f8fafb] px-3 py-2 text-xs text-[#5d6b77]">
          Al crear el usuario le enviamos un correo para que defina su
          propia contraseña — no se fija aquí.
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Nombre *</label>
          <input name="name" required defaultValue={editing?.name} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Correo *</label>
          <input
            name="email"
            type="email"
            required
            defaultValue={editing?.email}
            className={inputCls}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Rol *</label>
          <select name="role" required defaultValue={editing?.role ?? ""} className={inputCls}>
            <option value="" disabled>
              Elegir rol…
            </option>
            {ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Color</label>
          <input
            name="color"
            type="color"
            defaultValue={editing?.color || "#08a89f"}
            className="h-9 w-full rounded-lg border border-[#e4e8ec]"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Equipo</label>
          <select name="teamId" defaultValue={editing?.teamId ?? ""} className={inputCls}>
            <option value="">Sin equipo</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-[#9aa5ad]">
            Solo aplica a roles de equipo (se ignora en Cliente).
          </p>
        </div>
        <div>
          <label className={labelCls}>Cliente asociado</label>
          <select name="clientId" defaultValue={editing?.clientId ?? ""} className={inputCls}>
            <option value="">Ninguno</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-[#9aa5ad]">
            Obligatorio solo para rol Cliente (acceso al portal).
          </p>
        </div>
      </div>
      {editing && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={editing.isActive}
            className="h-4 w-4 accent-[#0bdbcf]"
          />
          Usuario activo (desmarcar bloquea el login de inmediato)
        </label>
      )}
      <div className="flex gap-2 pt-2">
        <button className="rounded-md bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
          {submitLabel}
        </button>
        <Link
          href="/admin/usuarios"
          className="rounded-md border border-[#e4e8ec] px-4 py-2 text-sm text-[#5d6b77] hover:bg-[#f8fafb]"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
