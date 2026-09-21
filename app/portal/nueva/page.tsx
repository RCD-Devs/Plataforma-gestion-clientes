import type { ReactNode } from "react";
import { submitClientRequest } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PortalShell, shellProps } from "@/components/portal/PortalShell";
import { prisma } from "@/lib/db";
import { requirePortalUser } from "@/lib/portal";
import { REQUEST_TYPES, PRIORITIES } from "@/lib/constants";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function NuevaSolicitudPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const ctx = await requirePortalUser();
  const { client } = ctx;
  const projects = await prisma.project.findMany({
    where: { clientId: client.id, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <PortalShell {...shellProps(ctx)}>
      <section className="max-w-xl rounded-2xl border border-[#e4e8ec] bg-white p-5">
        <h1 className="font-brand text-sm font-semibold">Nueva solicitud</h1>
        <p className="mb-4 mt-1 text-xs text-[#5d6b77]">
          Solicitud para {client.name} · se registrará con la fecha de hoy y tu
          correo.
        </p>
        {error === "descripcion" && (
          <div className="mb-4 rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
            Cuéntanos qué necesitas en la descripción.
          </div>
        )}
        <form action={submitClientRequest} className="space-y-3">
          <Field label="Tipo de solicitud">
            <select name="type" className={inputCls} defaultValue={REQUEST_TYPES[0]}>
              {REQUEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          {projects.length > 0 && (
            <Field label="Sitio / proyecto">
              <select name="projectId" className={inputCls} defaultValue="">
                <option value="">General (no aplica a un sitio)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Descripción">
            <textarea
              name="description"
              rows={5}
              required
              placeholder="Cuéntanos qué necesitas…"
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prioridad">
              <select name="priority" className={inputCls} defaultValue="MEDIA">
                {PRIORITIES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha de entrega">
              <input name="dueDate" type="date" className={inputCls} />
            </Field>
          </div>
          <Field label="Archivo adjunto (PDF, PNG, JPG)">
            <input
              type="file"
              name="file"
              accept=".pdf,.png,.jpg,.jpeg,.gif"
              className="w-full text-sm text-[#5d6b77] file:mr-3 file:rounded-lg file:border-0 file:bg-[#e0fbf9] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#065f5a]"
            />
          </Field>
          <SubmitButton
            className="w-full rounded-lg bg-[#0bdbcf] py-2.5 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]"
            pendingLabel="Enviando…"
          >
            Enviar solicitud
          </SubmitButton>
        </form>
      </section>
    </PortalShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-semibold">{label}</div>
      {children}
    </label>
  );
}
