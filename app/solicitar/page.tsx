import type { ReactNode } from "react";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { submitRequest } from "@/app/actions";
import { ClientProjectFields } from "@/components/ClientProjectFields";
import { REQUEST_TYPES, PRIORITIES } from "@/lib/constants";
import { getSessionUser } from "@/lib/session";
import { hasAccess } from "@/lib/permissions";
import { clientVisibilityWhere } from "@/lib/authz";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e6e8eb] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function SolicitarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // Público anónimo: todas las empresas activas. Equipo interno: solo sus
  // clientes (mismo alcance que el resto de la app) y, con permiso de
  // asignar, el responsable entre los perfiles asociados a cada cliente
  // (encargado de cuenta + miembros).
  const user = await getSessionUser();
  const internal = !!user && user.role !== "CLIENTE";
  const canAssign = internal && hasAccess(user.capabilities, "requests.assign");
  const activeInternal = { role: { not: "CLIENTE" }, isActive: true };
  const clients = await prisma.client.findMany({
    where: { isActive: true, ...(internal ? clientVisibilityWhere(user) : {}) },
    orderBy: { name: "asc" },
    include: {
      projects: {
        where: { archivedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
      accountManager: { select: { id: true, name: true, role: true, isActive: true } },
      members: {
        where: { user: activeInternal },
        select: { user: { select: { id: true, name: true } } },
      },
    },
  });
  const assigneesOf = (c: (typeof clients)[number]) => {
    if (!canAssign) return undefined;
    const am = c.accountManager;
    const list = [
      ...(am && am.isActive && am.role !== "CLIENTE" ? [{ id: am.id, name: am.name }] : []),
      ...c.members.map((m) => m.user),
    ];
    return [...new Map(list.map((u) => [u.id, u])).values()].sort((a, b) => a.name.localeCompare(b.name));
  };

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
          {error === "datos" && (
            <div className="rounded-lg border border-[#fda565] bg-[#fdf1e3] px-3 py-2 text-sm text-[#9a5a25]">
              Falta seleccionar la empresa/cliente o escribir un título.
            </div>
          )}
          {error === "correo" && (
            <div className="rounded-lg border border-[#fda565] bg-[#fdf1e3] px-3 py-2 text-sm text-[#9a5a25]">
              Ese correo no parece válido — revísalo e intenta de nuevo.
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
          <ClientProjectFields
            inputCls={inputCls}
            clients={clients.map((c) => ({
              id: c.id,
              name: c.name,
              projects: c.projects,
              assignees: assigneesOf(c),
            }))}
          />

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
          <p className="text-center text-xs text-[#6b7280]">
            Podrás adjuntar archivos (PDF, PNG) y seguir el estado desde el
            portal.
          </p>
          <p className="text-center text-xs text-[#6b7280]">
            Al enviar aceptas nuestro{" "}
            <a href="/privacidad" target="_blank" className="underline">
              aviso de privacidad
            </a>
            .
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
      {hint && <div className="mb-1 text-xs text-[#6b7280]">{hint}</div>}
      {children}
    </label>
  );
}
