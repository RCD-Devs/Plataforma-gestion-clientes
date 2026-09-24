import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { projectHref } from "@/lib/projectInsights";
import { updateClient, createHoursAdjustment, createProject, setProjectActive } from "@/app/actions";
import { hasAccess, attachCapabilities } from "@/lib/permissions";
import { ClientForm } from "@/components/admin/ClientForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ActiveToggle } from "@/components/admin/ActiveToggle";
import { getHoursSummaries } from "@/lib/hoursLedger";
import { hoursLabel, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function EditarClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [client, users, adjustments, projects, members] = await Promise.all([
    prisma.client.findUnique({ where: { id } }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      include: { roles: { include: { role: { include: { permissions: true } } } } },
    }),
    prisma.hoursAdjustment.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" } }),
    prisma.project.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" } }),
    prisma.clientMember.findMany({ where: { clientId: id }, select: { userId: true } }),
  ]);
  if (!client) notFound();
  const managers = users
    .map(attachCapabilities)
    .filter((u) => hasAccess(u.capabilities, "clients.view"));
  const summaries = await getHoursSummaries([client]);
  const ledger = summaries.get(client.id)!;

  return (
    <div>
      <ClientForm
        client={client}
        managers={managers}
        teamUsers={users.filter((u) => u.role !== "CLIENTE" && u.isActive)}
        memberIds={members.map((m) => m.userId)}
        error={error}
        action={updateClient.bind(null, id)}
        submitLabel="Guardar cambios"
      />

      <div className="max-w-xl space-y-4 border-t border-[#e6e8eb] p-6">
        <h2 className="text-sm font-semibold">Bolsa de horas</h2>
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-[#e4e8ec] bg-[#f8fafb] p-4 text-sm">
          <div>
            <div className="text-xs text-[#6b7280]">Disponible ahora</div>
            <div className="text-lg font-semibold">{hoursLabel(ledger.available)}</div>
          </div>
          <div>
            <div className="text-xs text-[#6b7280]">Horas extra (sin cubrir por la bolsa)</div>
            <div
              className="text-lg font-semibold"
              style={{ color: ledger.extraHours > 0 ? "#d21f3c" : undefined }}
            >
              {ledger.extraHours > 0 ? `+${hoursLabel(ledger.extraHours)}` : "—"}
            </div>
          </div>
          {ledger.nextRenewalAt && (
            <div className="col-span-2 text-xs text-[#5d6b77]">
              Próxima renovación automática: {shortDate(ledger.nextRenewalAt)}
            </div>
          )}
          {ledger.cycles.length > 1 && (
            <div className="col-span-2 text-xs text-[#5d6b77]">
              Ciclo actual: {hoursLabel(ledger.cycles.at(-1)!.logged)} consumidas · arrastre de ciclos anteriores:{" "}
              {hoursLabel(ledger.cycles.slice(0, -1).filter((c) => !c.expired).reduce((a, c) => a + c.remaining, 0))}
            </div>
          )}
        </div>

        {error === "ajuste_invalido" && (
          <div className="rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
            Ingresa una cantidad de horas distinta de cero.
          </div>
        )}

        <form
          action={createHoursAdjustment.bind(null, id)}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-[#e4e8ec] p-3"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#5d6b77]">
              Horas
            </label>
            <input name="hours" type="number" step="0.5" required className={`${inputCls} w-32`} />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-[#5d6b77]">Nota</label>
            <input name="note" placeholder="Motivo del ajuste" className={inputCls} />
          </div>
          <SubmitButton className="h-9 rounded-md bg-[#0bdbcf] px-3 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
            Agregar ajuste
          </SubmitButton>
          <p className="w-full text-[11px] text-[#6b7280]">
            Positivo (ej. 10) suma horas a la bolsa y no vencen — un paquete extra o una cortesía.
            Negativo (ej. -5) resta horas del saldo — para corregir un ajuste mal ingresado o
            descontar horas acordadas con el cliente.
          </p>
        </form>

        {adjustments.length > 0 && (
          <div className="space-y-1.5">
            {adjustments.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-[#f1f3f4] px-3 py-2 text-xs"
              >
                <span>
                  <span
                    className="font-semibold"
                    style={{ color: a.hours < 0 ? "#d21f3c" : "#0e9f6e" }}
                  >
                    {a.hours > 0 ? "+" : ""}
                    {hoursLabel(a.hours)}
                  </span>{" "}
                  {a.note && <span className="text-[#5d6b77]">· {a.note}</span>}
                </span>
                <span className="text-[#6b7280]">
                  {a.actorName || "—"} · {shortDate(a.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-xl space-y-4 border-t border-[#e6e8eb] p-6">
        <h2 className="text-sm font-semibold">Proyectos</h2>
        <p className="text-xs text-[#6b7280]">
          Cada proyecto o sitio es su propio tablero filtrado, y sus horas se
          ven por separado en el portal del cliente. Al ingresar una solicitud
          (formulario público o portal) el cliente puede elegir el sitio; si
          no elige, queda como mantención general.
        </p>

        {projects.length > 0 && (
          <div className="space-y-1.5">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-[#f1f3f4] px-3 py-2 text-sm"
              >
                <Link href={projectHref(p, client)} className="hover:text-[#08a89f] hover:underline">
                  {p.name}
                </Link>
                <ActiveToggle
                  id={p.id}
                  isActive={!p.archivedAt}
                  action={setProjectActive}
                  confirmDeactivate={`Al cerrar "${p.name}", todas sus tareas pendientes quedarán Finalizadas (reactivarlo no las reabre). ¿Continuar?`}
                />
              </div>
            ))}
          </div>
        )}

        <form
          action={createProject.bind(null, id)}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-[#e4e8ec] p-3"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-[#5d6b77]">
              Nombre del proyecto
            </label>
            <input name="name" required className={inputCls} />
          </div>
          <SubmitButton className="h-9 rounded-md bg-[#0bdbcf] px-3 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
            Crear proyecto
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
