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
import { getHoursSummaries, type CycleSummary } from "@/lib/hoursLedger";
import { getStatuses } from "@/lib/statuses";
import { Avatar } from "@/components/ui";
import { hoursLabel, initials, longDate, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const months = (n: number) => `${n} ${n === 1 ? "mes" : "meses"}`;
const monthFmt = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" });
const HISTORY = 6;

function cycleLabel(c: CycleSummary, cycleMonths: number) {
  if (cycleMonths === 1) {
    const s = monthFmt.format(c.start);
    return s[0].toUpperCase() + s.slice(1);
  }
  return `${shortDate(c.start)} → ${shortDate(c.end)}`;
}

// Ficha de solo lectura del cliente; la edición vive en /admin/clientes/[id].
export default async function ClienteFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isManager(user)) redirect("/mi-espacio");

  const id = await resolveClientId((await params).id);
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      accountManager: { select: { name: true, color: true } },
      members: { include: { user: { select: { name: true, color: true } } } },
      projects: { where: { archivedAt: null }, orderBy: { createdAt: "desc" }, include: { _count: { select: { requests: true } } } },
      requests: { select: { status: true } },
    },
  });
  if (!client) notFound();
  if (!canOnClient(user.capabilities, "clients.view", user.id, client, user.ownClientIds)) notFound();

  const now = new Date();
  const [summaries, statuses] = await Promise.all([getHoursSummaries([client], now), getStatuses()]);
  const ledger = summaries.get(client.id)!;
  const finalCodes = new Set(statuses.filter((s) => s.isFinal).map((s) => s.code));
  const open = client.requests.filter((r) => !finalCodes.has(r.status)).length;
  const hasBag = client.contractedHours > 0;
  const slug = client.slug ?? withSlug(client.id, client.name);
  const color = client.color || "#08a89f";

  const current = ledger.cycles.at(-1);
  const carried = ledger.cycles.slice(0, -1).filter((c) => !c.expired).reduce((a, c) => a + c.remaining, 0);
  const history = ledger.cycles.slice(-HISTORY).reverse();
  const daysLeft = ledger.nextRenewalAt ? Math.ceil((ledger.nextRenewalAt.getTime() - now.getTime()) / 86400000) : null;
  const usedPct = current ? (current.logged / current.granted) * 100 : 0;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e6e8eb] bg-white px-6 py-4">
        <Link href="/clientes" className="text-xs text-[#6b7280] hover:underline">
          ← Clientes
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-brand text-lg font-semibold text-white"
              style={{ background: color }}
            >
              {initials(client.name)}
            </span>
            <div>
              <h1 className="flex flex-wrap items-center gap-2 font-brand text-xl font-semibold">
                {client.name}
                {client.code && (
                  <span className="rounded bg-[#f3f4f6] px-1.5 py-0.5 font-sans text-xs font-medium text-[#6b7280]">
                    {client.code}
                  </span>
                )}
                {client.isActive ? (
                  <Pill tone="ok">Activo</Pill>
                ) : (
                  <Pill tone="warn">Archivado</Pill>
                )}
              </h1>
              <p className="text-xs text-[#6b7280]">
                Cliente desde {longDate(client.createdAt)}
                {client.accountManager && ` · Coordina ${client.accountManager.name}`}
              </p>
            </div>
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
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto bg-[#f7f8fa] p-6">
        {hasBag && current ? (
          <section className="overflow-hidden rounded-2xl border border-[#e6e8eb] bg-white">
            <div className="grid lg:grid-cols-[1.4fr_1fr]">
              <div className="p-6">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Ciclo actual</h2>
                  <span className="text-xs text-[#6b7280]">
                    {shortDate(current.start)} → {shortDate(current.end)}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tracking-tight">{hoursLabel(current.logged)}</span>
                  <span className="text-sm text-[#6b7280]">consumidas de {hoursLabel(current.granted)}</span>
                </div>
                <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[#eef1f4]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, usedPct)}%`, background: usedPct > 100 ? "#d21f3c" : usedPct > 85 ? "#f59e0b" : "#08a89f" }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-[#6b7280]">
                  <span>{Math.round(usedPct)}% del ciclo</span>
                  <span>
                    {daysLeft !== null && `Renueva en ${daysLeft} ${daysLeft === 1 ? "día" : "días"} (${shortDate(ledger.nextRenewalAt)})`}
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-2 text-xs">
                  <Chip>{hoursLabel(client.contractedHours)} por ciclo</Chip>
                  <Chip>Renueva cada {months(client.cycleMonths)}</Chip>
                  <Chip>{client.carryoverMonths > 0 ? `Arrastre ${months(client.carryoverMonths)}` : "Sin arrastre"}</Chip>
                  <Chip>Contrato desde {shortDate(client.cycleStartDate ?? client.createdAt)}</Chip>
                </div>
              </div>

              <div className="space-y-4 border-t border-[#e6e8eb] bg-[#f9fafb] p-6 lg:border-l lg:border-t-0">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">Saldo disponible</div>
                  <div className="mt-1 text-3xl font-semibold text-[#08a89f]">{hoursLabel(ledger.available)}</div>
                </div>
                <dl className="space-y-2 text-sm">
                  <Line label="Libres del ciclo actual" value={hoursLabel(current.remaining)} />
                  {client.carryoverMonths > 0 && (
                    <Line label="Arrastre de ciclos anteriores" value={hoursLabel(carried)} />
                  )}
                  {ledger.available - current.remaining - carried > 0.05 && (
                    <Line label="Ajustes manuales" value={hoursLabel(ledger.available - current.remaining - carried)} />
                  )}
                  <Line
                    label="Horas extra sin cubrir"
                    value={ledger.extraHours > 0 ? <span className="text-[#d21f3c]">+{hoursLabel(ledger.extraHours)}</span> : "—"}
                  />
                </dl>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-[#d6dbe0] bg-white p-6 text-sm text-[#6b7280]">
            Este cliente no tiene bolsa de horas configurada.
          </section>
        )}

        {hasBag && history.length > 0 && (
          <Card title="Historial de consumo" hint={`Últimos ${history.length} ciclos`}>
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#6b7280]">
                    <th className="px-4 pb-2 font-medium">Ciclo</th>
                    <th className="px-4 pb-2 font-medium">Consumo</th>
                    <th className="px-4 pb-2 text-right font-medium">Sobrante</th>
                    <th className="px-4 pb-2 text-right font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((c, i) => {
                    const pct = (c.logged / c.granted) * 100;
                    return (
                      <tr key={c.start.toISOString()} className="border-t border-[#f0f2f4]">
                        <td className="whitespace-nowrap px-4 py-3 font-medium">{cycleLabel(c, client.cycleMonths)}</td>
                        <td className="w-1/2 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#eef1f4]">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.min(100, pct)}%`, background: pct > 100 ? "#d21f3c" : "#08a89f" }}
                              />
                            </div>
                            <span className="w-28 whitespace-nowrap text-right tabular-nums">
                              {hoursLabel(c.logged)} <span className="text-xs text-[#9ca3af]">/ {Math.round(c.granted)}</span>
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {c.remaining > 0.05 ? hoursLabel(c.remaining) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <CycleStatus cycle={c} isCurrent={i === 0} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Contacto y equipo">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-[#6b7280]">Correo de contacto</dt>
                <dd className="mt-0.5 font-medium">
                  {client.contactEmail ? (
                    <a href={`mailto:${client.contactEmail}`} className="text-[#08a89f] hover:underline">
                      {client.contactEmail}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#6b7280]">Coordinador de cuenta</dt>
                <dd className="mt-1">
                  {client.accountManager ? (
                    <Person name={client.accountManager.name} color={client.accountManager.color} />
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#6b7280]">Equipo asignado</dt>
                <dd className="mt-1 space-y-1.5">
                  {client.members.length
                    ? client.members.map((m) => <Person key={m.userId} name={m.user.name} color={m.user.color} />)
                    : "—"}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Solicitudes">
            <div className="flex items-end gap-6">
              <div>
                <div className="text-3xl font-semibold">{open}</div>
                <div className="text-xs text-[#6b7280]">abiertas</div>
              </div>
              <div>
                <div className="text-3xl font-semibold text-[#9ca3af]">{client.requests.length - open}</div>
                <div className="text-xs text-[#6b7280]">cerradas</div>
              </div>
            </div>
            {client.requests.length > 0 && (
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#eef1f4]">
                <div
                  className="h-full rounded-full bg-[#08a89f]"
                  style={{ width: `${((client.requests.length - open) / client.requests.length) * 100}%` }}
                />
              </div>
            )}
            <Link href={`/tablero?cliente=${clientParam(client)}`} className="mt-4 inline-block text-xs font-semibold text-[#08a89f] hover:underline">
              Ir al tablero →
            </Link>
          </Card>

          <Card title="Proyectos activos" hint={client.projects.length ? String(client.projects.length) : undefined}>
            {client.projects.length ? (
              <ul className="space-y-1">
                {client.projects.map((p) => {
                  const body = (
                    <>
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-xs text-[#9ca3af]">{p._count.requests} sol.</span>
                    </>
                  );
                  const cls = "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm";
                  return (
                    <li key={p.id}>
                      {hasAccess(user.capabilities, "projects.view") ? (
                        <Link href={projectHref(p, client)} className={`${cls} hover:bg-[#f3f4f6]`}>
                          {body}
                        </Link>
                      ) : (
                        <div className={cls}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-[#6b7280]">Sin proyectos activos.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function CycleStatus({ cycle, isCurrent }: { cycle: CycleSummary; isCurrent: boolean }) {
  if (isCurrent) return <Pill tone="info">En curso</Pill>;
  if (cycle.remaining <= 0.05) return <Pill tone="muted">Consumido</Pill>;
  if (cycle.expired) return <Pill tone="warn">Venció · {hoursLabel(cycle.remaining)} perdidas</Pill>;
  return <Pill tone="ok">Usable hasta {shortDate(cycle.expiresAt)}</Pill>;
}

const TONES = {
  ok: "bg-[#e6f7f5] text-[#067a73]",
  info: "bg-[#e8f0fe] text-[#2956b8]",
  warn: "bg-[#feede6] text-[#9a4a1e]",
  muted: "bg-[#f3f4f6] text-[#6b7280]",
};

function Pill({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-sans text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-[#e4e8ec] bg-white px-2.5 py-1 text-[#4b5563]">{children}</span>;
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[#6b7280]">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Person({ name, color }: { name: string; color: string | null }) {
  return (
    <div className="flex items-center gap-2 font-medium">
      <Avatar name={name} color={color} size={24} />
      {name}
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e6e8eb] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-xs text-[#9ca3af]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
