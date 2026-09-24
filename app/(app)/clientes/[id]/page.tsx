import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isManager } from "@/lib/authz";
import { canOnClient, canManageClients, hasAccess } from "@/lib/permissions";
import { clientParam } from "@/lib/requestFilters";
import { resolveClientId } from "@/lib/clientReport";
import { projectHref } from "@/lib/projectInsights";
import { withSlug } from "@/lib/slug";
import { getHoursSummaries } from "@/lib/hoursLedger";
import { getStatuses } from "@/lib/statuses";
import { StatCard } from "@/components/ui";
import { hoursLabel, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const months = (n: number) => `${n} ${n === 1 ? "mes" : "meses"}`;

// Ficha de solo lectura del cliente; la edición vive en /admin/clientes/[id].
export default async function ClienteFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isManager(user)) redirect("/mi-espacio");

  const id = await resolveClientId((await params).id);
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      accountManager: { select: { name: true } },
      members: { include: { user: { select: { name: true } } } },
      projects: { where: { archivedAt: null }, orderBy: { createdAt: "desc" } },
      requests: { select: { status: true } },
    },
  });
  if (!client) notFound();
  if (!canOnClient(user.capabilities, "clients.view", user.id, client, user.ownClientIds)) notFound();

  const [summaries, statuses] = await Promise.all([getHoursSummaries([client]), getStatuses()]);
  const ledger = summaries.get(client.id)!;
  const finalCodes = new Set(statuses.filter((s) => s.isFinal).map((s) => s.code));
  const open = client.requests.filter((r) => !finalCodes.has(r.status)).length;
  const hasBag = client.contractedHours > 0;
  const slug = client.slug ?? withSlug(client.id, client.name);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e8eb] bg-white px-6 py-3">
        <div>
          <Link href="/clientes" className="text-xs text-[#6b7280] hover:underline">
            ← Clientes
          </Link>
          <h1 className="flex items-center gap-2 font-brand text-base font-semibold">
            <span className="h-3 w-3 rounded-full" style={{ background: client.color || "#08a89f" }} />
            {client.name}
            {client.code && (
              <span className="rounded bg-[#f3f4f6] px-1.5 py-0.5 text-xs font-normal text-[#6b7280]">
                {client.code}
              </span>
            )}
            {!client.isActive && (
              <span className="rounded bg-[#feede6] px-1.5 py-0.5 text-xs font-normal text-[#9a4a1e]">
                Archivado
              </span>
            )}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={`/tablero?cliente=${clientParam(client)}`} className="rounded-md border border-[#e4e8ec] px-3 py-1.5 font-semibold hover:bg-[#f3f4f6]">
            Ver tareas
          </Link>
          <Link href={`/clientes/${slug}/reporte`} className="rounded-md border border-[#e4e8ec] px-3 py-1.5 font-semibold hover:bg-[#f3f4f6]">
            Ver reporte
          </Link>
          {canManageClients(user) && (
            <Link
              href={`/admin/clientes/${client.id}`}
              className="rounded-md bg-[#0bdbcf] px-3 py-1.5 font-semibold text-[#081826] hover:bg-[#09c4ba]"
            >
              Editar
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Saldo disponible"
            value={hasBag ? hoursLabel(ledger.available) : "—"}
            hint={hasBag ? `de ${hoursLabel(client.contractedHours)} por ciclo` : "Sin bolsa configurada"}
          />
          <StatCard
            label="Horas extra"
            value={ledger.extraHours > 0 ? <span className="text-[#d21f3c]">+{hoursLabel(ledger.extraHours)}</span> : "—"}
            hint="sin cubrir por la bolsa"
          />
          <StatCard label="Solicitudes" value={client.requests.length} hint={`${open} abiertas`} />
          <StatCard label="Proyectos activos" value={client.projects.length} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Datos del cliente">
            <Row label="Correo de contacto" value={client.contactEmail || "—"} />
            <Row label="Coordinador de cuenta" value={client.accountManager?.name || "—"} />
            <Row
              label="Equipo asignado"
              value={client.members.map((m) => m.user.name).join(", ") || "—"}
            />
            <Row label="Cliente desde" value={shortDate(client.createdAt)} />
          </Section>

          <Section title="Bolsa de horas">
            {hasBag ? (
              <>
                <Row label="Horas por ciclo" value={hoursLabel(client.contractedHours)} />
                <Row label="Se renueva cada" value={months(client.cycleMonths)} />
                <Row
                  label="Arrastre de sobrantes"
                  value={client.carryoverMonths > 0 ? months(client.carryoverMonths) : "Sin arrastre"}
                />
                <Row label="Inicio del contrato" value={shortDate(client.cycleStartDate ?? client.createdAt)} />
                {ledger.nextRenewalAt && <Row label="Próxima renovación" value={shortDate(ledger.nextRenewalAt)} />}
                {ledger.expiring.length > 0 && (
                  <Row
                    label="Por vencer"
                    value={ledger.expiring.map((e) => `${hoursLabel(e.hours)} el ${shortDate(e.expiresAt)}`).join(" · ")}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-[#6b7280]">Sin bolsa configurada.</p>
            )}
          </Section>
        </div>

        {client.projects.length > 0 && (
          <Section title="Proyectos activos">
            {client.projects.map((p) =>
              hasAccess(user.capabilities, "projects.view") ? (
                <Link key={p.id} href={projectHref(p, client)} className="block text-sm font-semibold text-[#08a89f] hover:underline">
                  {p.name}
                </Link>
              ) : (
                <div key={p.id} className="text-sm">{p.name}</div>
              ),
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border border-[#e6e8eb] bg-white p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-[#6b7280]">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
