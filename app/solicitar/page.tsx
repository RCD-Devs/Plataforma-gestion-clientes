import type { ReactNode } from "react";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { submitRequest } from "@/app/actions";
import { REQUEST_TYPES, PRIORITIES } from "@/lib/constants";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e6e8eb] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function SolicitarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
  const { error } = await searchParams;

  return (
    <div className="min-h-screen bg-[#f4f6f8] py-10">
      <div className="mx-auto w-full max-w-xl px-4">
        <div className="mb-6 flex items-center gap-2">
          <Image src="/brand/logo.png" alt="REVO" width={120} height={53} />
          <div>
            <div className="text-lg font-semibold">Nueva solicitud</div>
            <div className="text-sm text-[#6b7280]">
              Grupo Revo · Cuéntanos qué necesitas
            </div>
          </div>
        </div>

        <form
          action={submitRequest}
          className="space-y-4 rounded-2xl border border-[#e6e8eb] bg-white p-6"
        >
          {error === "rate_limit" && (
            <div className="rounded-lg border border-[#fda565] bg-[#fdf1e3] px-3 py-2 text-sm text-[#9a5a25]">
              Demasiados envíos seguidos. Espera unos minutos e intenta de
              nuevo.
            </div>
          )}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />
          <Field label="Empresa / Cliente">
            <select
              name="clientId"
              required
              className={inputCls}
              defaultValue=""
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Tu correo"
            hint="Te avisaremos aquí cada cambio de estado"
          >
            <input
              name="requesterEmail"
              type="email"
              required
              placeholder="nombre@empresa.cl"
              className={inputCls}
            />
          </Field>

          <Field label="Tipo de solicitud">
            <select name="type" className={inputCls} defaultValue={REQUEST_TYPES[0]}>
              {REQUEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Título">
            <input
              name="title"
              required
              placeholder="Ej: Nueva landing de campaña"
              className={inputCls}
            />
          </Field>

          <Field label="Descripción">
            <textarea
              name="description"
              rows={4}
              placeholder="Detalla lo que necesitas…"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Prioridad">
              <select name="priority" className={inputCls} defaultValue="MEDIA">
                {PRIORITIES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha requerida">
              <input name="dueDate" type="date" className={inputCls} />
            </Field>
          </div>

          <button className="w-full rounded-lg bg-[#0bdbcf] py-2.5 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
            Enviar solicitud
          </button>
          <p className="text-center text-xs text-[#9ca3af]">
            Podrás adjuntar archivos (PDF, PNG) y seguir el estado desde el
            portal.
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium">{label}</div>
      {hint && <div className="mb-1 text-xs text-[#9ca3af]">{hint}</div>}
      {children}
    </label>
  );
}
