import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { updateClient, createHoursAdjustment } from "@/app/actions";
import { isManager } from "@/lib/authz";
import { ClientForm } from "@/components/admin/ClientForm";
import { SubmitButton } from "@/components/SubmitButton";
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
  const [client, users, adjustments] = await Promise.all([
    prisma.client.findUnique({ where: { id } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.hoursAdjustment.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!client) notFound();
  const managers = users.filter((u) => isManager(u.role));
  const summaries = await getHoursSummaries([client]);
  const ledger = summaries.get(client.id)!;

  return (
    <div>
      <ClientForm
        client={client}
        managers={managers}
        error={error}
        action={updateClient.bind(null, id)}
        submitLabel="Guardar cambios"
      />

      <div className="max-w-xl space-y-4 border-t border-[#e6e8eb] p-6">
        <h2 className="text-sm font-semibold">Bolsa de horas</h2>
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-[#e4e8ec] bg-[#f8fafb] p-4 text-sm">
          <div>
            <div className="text-xs text-[#9aa5ad]">Disponible ahora</div>
            <div className="text-lg font-semibold">{hoursLabel(ledger.available)}</div>
          </div>
          <div>
            <div className="text-xs text-[#9aa5ad]">Horas extra (sin cubrir por la bolsa)</div>
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
          {ledger.expiring.length > 0 && (
            <div className="col-span-2 text-xs text-[#5d6b77]">
              Por vencer:{" "}
              {ledger.expiring
                .map((e) => `${hoursLabel(e.hours)} el ${shortDate(e.expiresAt)}`)
                .join(" · ")}
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
              Horas (negativo para restar)
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
                <span className="text-[#9aa5ad]">
                  {a.actorName || "—"} · {shortDate(a.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
