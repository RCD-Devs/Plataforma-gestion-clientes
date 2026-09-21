import type { ReactNode } from "react";
import Link from "next/link";
import type { Client } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cycleGrants, getHoursSummaries } from "@/lib/hoursLedger";
import { getStatuses } from "@/lib/statuses";
import { Avatar, Bar } from "@/components/ui";
import { hoursLabel, longDate } from "@/lib/format";

export async function PortalDashboard({ client }: { client: Client }) {
  const now = new Date();
  const hasBag = client.contractedHours > 0;
  const grants = cycleGrants(client, now);
  // Inicio del ciclo vigente; sin bolsa contratada se cuenta todo el historial.
  const cycleStart = hasBag ? grants[grants.length - 1]?.grantedAt ?? null : null;

  const teamOr = [
    { assigned: { some: { clientId: client.id } } },
    { timeEntries: { some: { request: { clientId: client.id } } } },
    { collaborations: { some: { request: { clientId: client.id } } } },
    ...(client.accountManagerId ? [{ id: client.accountManagerId }] : []),
  ];

  const [summaries, entries, team, projects, statusCounts, statuses] = await Promise.all([
    getHoursSummaries([client], now),
    prisma.timeEntry.findMany({
      where: {
        request: { clientId: client.id },
        ...(cycleStart ? { date: { gte: cycleStart } } : {}),
      },
      select: { hours: true, request: { select: { key: true, title: true } } },
    }),
    prisma.user.findMany({
      where: { isActive: true, role: { not: "CLIENTE" }, OR: teamOr },
      include: { roles: { include: { role: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { clientId: client.id, archivedAt: null },
      include: { requests: { where: { archivedAt: null }, select: { status: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.request.groupBy({
      by: ["status"],
      where: { clientId: client.id },
      _count: true,
    }),
    getStatuses(),
  ]);

  const ledger = summaries.get(client.id)!;
  const used = entries.reduce((a, e) => a + e.hours, 0);
  const usedPct = hasBag ? (used / client.contractedHours) * 100 : 0;
  const barColor = usedPct >= 100 ? "#d21f3c" : usedPct >= 80 ? "#c97416" : "#0e9f6e";

  const byTask = new Map<string, { key: string; title: string; hours: number }>();
  for (const e of entries) {
    const t = byTask.get(e.request.key) ?? { ...e.request, hours: 0 };
    t.hours += e.hours;
    byTask.set(e.request.key, t);
  }
  const topTasks = [...byTask.values()].sort((a, b) => b.hours - a.hours).slice(0, 6);

  const finalCodes = new Set(statuses.filter((s) => s.isFinal).map((s) => s.code));
  const total = statusCounts.reduce((a, s) => a + s._count, 0);
  const done = statusCounts.filter((s) => finalCodes.has(s.status)).reduce((a, s) => a + s._count, 0);

  const nextExpiry = ledger.expiring[0];
  const roleLabel = (u: (typeof team)[number]) =>
    u.roles
      .filter((r) => !r.role.archivedAt)
      .map((r) => r.role.name)
      .join(" · ") || "Equipo REVO";
  // Responsable de cuenta primero.
  const people = [...team].sort(
    (a, b) => Number(b.id === client.accountManagerId) - Number(a.id === client.accountManagerId),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brand text-lg font-semibold">Hola, {client.name}</h1>
        <p className="text-xs text-[#5d6b77]">Resumen de tu servicio con REVO</p>
      </div>

      <Card title={hasBag ? "Consumo de horas del ciclo" : "Horas trabajadas"}>
        {hasBag ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-3xl font-semibold">{hoursLabel(used)}</span>
                <span className="ml-1 text-sm text-[#5d6b77]">
                  de {hoursLabel(client.contractedHours)} del ciclo
                </span>
              </div>
              <span className="text-xs text-[#5d6b77]">
                {ledger.nextRenewalAt
                  ? `Se renueva el ${longDate(ledger.nextRenewalAt)}`
                  : ""}
              </span>
            </div>
            <div className="mt-3">
              <Bar pct={usedPct} color={barColor} />
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <Mini label="Saldo disponible" value={hoursLabel(ledger.available)} hint="incluye arrastre" />
              <Mini
                label="Horas extra"
                value={ledger.extraHours > 0 ? `+${hoursLabel(ledger.extraHours)}` : "—"}
                hint="sobre la bolsa"
              />
              <Mini
                label="Próximo vencimiento"
                value={nextExpiry ? hoursLabel(nextExpiry.hours) : "—"}
                hint={nextExpiry ? `hasta el ${longDate(nextExpiry.expiresAt)}` : "sin horas por vencer"}
              />
            </div>
          </>
        ) : (
          <div className="text-3xl font-semibold">
            {hoursLabel(used)}
            <span className="ml-2 text-sm font-normal text-[#5d6b77]">
              registradas en tus solicitudes
            </span>
          </div>
        )}

        <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[#7f7f7f]">
          Horas por tarea{hasBag ? " en este ciclo" : ""}
        </h3>
        {topTasks.length === 0 ? (
          <p className="text-sm text-[#7f7f7f]">Aún no hay horas registradas.</p>
        ) : (
          <ul className="space-y-2">
            {topTasks.map((t) => (
              <li key={t.key} className="text-sm">
                <div className="mb-1 flex justify-between gap-3">
                  <Link
                    href={`/portal/solicitud/${t.key}`}
                    className="line-clamp-1 hover:text-[#08a89f] hover:underline"
                  >
                    <span className="text-xs text-[#7f7f7f]">{t.key}</span> {t.title}
                  </Link>
                  <span className="shrink-0 font-semibold">{hoursLabel(t.hours)}</span>
                </div>
                <Bar pct={(t.hours / topTasks[0].hours) * 100} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Tu equipo REVO">
          {people.length === 0 ? (
            <p className="text-sm text-[#7f7f7f]">Aún no hay personas asignadas.</p>
          ) : (
            <ul className="space-y-3">
              {people.map((u) => (
                <li key={u.id} className="flex items-center gap-3">
                  <Avatar name={u.name} color={u.color} size={36} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {u.name}
                      {u.id === client.accountManagerId && (
                        <span className="ml-2 rounded bg-[#e0fbf9] px-1.5 py-0.5 text-[10px] font-semibold text-[#065f5a]">
                          responsable de cuenta
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-[#5d6b77]">{roleLabel(u)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Tu proyecto">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Cliente" value={client.name} />
            <Info label="Cliente desde" value={longDate(client.cycleStartDate ?? client.createdAt)} />
            <Info
              label="Plan"
              value={
                hasBag
                  ? `${hoursLabel(client.contractedHours)} cada ${client.cycleMonths === 1 ? "mes" : `${client.cycleMonths} meses`}`
                  : "Sin bolsa de horas"
              }
            />
            <Info label="Solicitudes" value={`${done} de ${total} finalizadas`} />
          </dl>
          <div className="mt-2">
            <Bar pct={total ? (done / total) * 100 : 0} />
          </div>

          {projects.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[#7f7f7f]">
                Proyectos
              </h3>
              <ul className="space-y-3">
                {projects.map((p) => {
                  const pDone = p.requests.filter((r) => finalCodes.has(r.status)).length;
                  return (
                    <li key={p.id} className="text-sm">
                      <div className="mb-1 flex justify-between">
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-xs text-[#5d6b77]">
                          {pDone} de {p.requests.length} tareas
                        </span>
                      </div>
                      <Bar pct={p.requests.length ? (pDone / p.requests.length) * 100 : 0} />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e4e8ec] bg-white p-5">
      <h2 className="mb-3 font-brand text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-[#f4f6f8] p-3">
      <div className="text-xs text-[#5d6b77]">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
      <div className="text-xs text-[#7f7f7f]">{hint}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#7f7f7f]">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
