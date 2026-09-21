import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { canOnClient } from "@/lib/permissions";
import { budgetStatus } from "@/lib/projectBudget";
import { loadProjectInsights } from "@/lib/projectInsights";
import { DelayComparison, ProjectGantt, StageComparison } from "@/components/ProjectTimeline";
import { confirmProjectBudget, reopenProjectBudget, deleteStage, saveStage, setRequestStage, updateProjectBudget } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { StatusBadge, Bar } from "@/components/ui";
import { hoursLabel, shortDate } from "@/lib/format";
import { toDateInput } from "@/lib/dates";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";
const labelCls = "mb-1 block text-xs font-semibold text-[#5d6b77]";
const btnCls =
  "rounded-md bg-[#0bdbcf] px-3 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]";

const ERRORS: Record<string, string> = {
  fuera_marco: "La etapa debe quedar dentro del marco de fechas del proyecto (inicio y término de la cubicación).",
  etapas_fuera: "Hay etapas fuera de esas fechas: ajústalas antes de cambiar el marco del proyecto.",
  fechas_requeridas: "Con el proyecto en curso, la etapa adicional necesita fecha de inicio y de término.",
  cubicacion_vacia: "Carga horas estimadas o fechas antes de confirmar la cubicación.",
};

export default async function ProyectoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const insights = await loadProjectInsights(id);
  if (!insights) notFound();
  const { project, timeline, finalCodes, hoursByRequest } = insights;
  const can = (a: "projects.view" | "projects.manage" | "projects.budget") =>
    canOnClient(user.capabilities, a, user.id, project.client, user.ownClientIds);
  if (!can("projects.view")) redirect("/mi-espacio");
  const canManage = can("projects.manage");
  const canBudget = can("projects.budget");

  const hoursOf = (r: (typeof project.requests)[number]) => r.timeEntries.reduce((a, t) => a + t.hours, 0);
  const consumed = project.requests.reduce((a, r) => a + hoursOf(r), 0);
  const allDone = project.requests.length > 0 && project.requests.every((r) => finalCodes.has(r.status));
  const b = budgetStatus({
    estimatedHours: project.estimatedHours,
    consumedHours: consumed,
    startDate: project.startDate,
    endDate: project.endDate,
    done: allDone,
  });
  const noStage = project.requests.filter((r) => !r.stageId);
  const proposedHours = project.stages.filter((s) => !s.isAdditional).reduce((a, s) => a + (s.estimatedHours ?? 0), 0);
  const frameMin = project.startDate ? toDateInput(project.startDate) : undefined;
  const frameMax = project.endDate ? toDateInput(project.endDate) : undefined;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e4e8ec] bg-white px-6 py-3">
        <Link href="/proyectos" className="text-xs text-[#5d6b77] hover:underline">
          ← Proyectos
        </Link>
        <h1 className="mt-1 font-brand text-base font-semibold">{project.name}</h1>
        <p className="text-xs text-[#5d6b77]">{project.client.name}</p>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {error === "fechas" && (
          <div className="rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
            La fecha de término no puede ser anterior a la de inicio.
          </div>
        )}
        {error && error !== "fechas" && ERRORS[error] && (
          <div className="rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
            {ERRORS[error]}
          </div>
        )}

        <section className="rounded-xl border border-[#e4e8ec] bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold">Cubicación estimada</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-[#5d6b77]">Horas</div>
              {b.hasHours ? (
                <>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold">{hoursLabel(consumed)}</span>
                    <span className="text-sm text-[#5d6b77]">de {hoursLabel(project.estimatedHours!)}</span>
                  </div>
                  <div className="mt-2">
                    <Bar pct={b.pctUsed} color={b.redHours > 0 ? "#d21f3c" : b.pctUsed >= 80 ? "#c97416" : "#0e9f6e"} />
                  </div>
                  <div className="mt-1 text-sm">
                    {b.redHours > 0 ? (
                      <span className="font-semibold text-[#d21f3c]">
                        {hoursLabel(b.redHours)} en rojo (sobre lo estimado)
                      </span>
                    ) : (
                      <span className="text-[#5d6b77]">Restan {hoursLabel(b.remainingHours)}</span>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-[#7f7f7f]">
                  Sin horas estimadas · {hoursLabel(consumed)} consumidas
                </p>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-[#5d6b77]">Fechas</div>
              {b.hasDates ? (
                <>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold">día {b.elapsedDays}</span>
                    <span className="text-sm text-[#5d6b77]">
                      de {b.totalDays} · {shortDate(project.startDate)} → {shortDate(project.endDate)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Bar pct={(b.elapsedDays / b.totalDays) * 100} color={b.lateDays > 0 ? "#d21f3c" : "#0bdbcf"} />
                  </div>
                  {b.lateDays > 0 && (
                    <div className="mt-1 text-sm font-semibold text-[#d21f3c]">
                      {b.lateDays} día{b.lateDays === 1 ? "" : "s"} de atraso
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm text-[#7f7f7f]">Sin fechas definidas</p>
              )}
            </div>
          </div>

          {canBudget && (
            <form
              action={updateProjectBudget.bind(null, project.id)}
              className="mt-5 grid grid-cols-2 items-end gap-3 border-t border-[#f1f3f4] pt-4 md:grid-cols-4"
            >
              <div>
                <label className={labelCls}>Inicio</label>
                <input name="startDate" type="date" defaultValue={project.startDate ? toDateInput(project.startDate) : ""} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Término</label>
                <input name="endDate" type="date" defaultValue={project.endDate ? toDateInput(project.endDate) : ""} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Horas estimadas</label>
                <input name="estimatedHours" type="number" min="0" step="0.5" defaultValue={project.estimatedHours ?? ""} className={inputCls} />
              </div>
              <SubmitButton className={btnCls}>Guardar cubicación</SubmitButton>
            </form>
          )}
          {project.baselineAt ? (
            <div className="mt-4 rounded-lg bg-[#f4f6f8] px-3 py-2 text-xs text-[#5d6b77]">
              Cubicación confirmada el {shortDate(project.baselineAt)}. Las etapas que se agreguen ahora son
              adicionales y deben quedar dentro del marco{" "}
              {project.startDate && project.endDate
                ? `${shortDate(project.startDate)} → ${shortDate(project.endDate)}`
                : "inicial"}
              .
              {canBudget && (
                <form action={reopenProjectBudget.bind(null, project.id)} className="mt-2">
                  <SubmitButton className="rounded-md border border-[#e4e8ec] bg-white px-3 py-1.5 text-xs font-semibold text-[#5d6b77] hover:bg-[#f8fafb]">
                    Reabrir cubicación
                  </SubmitButton>
                  <span className="ml-2">
                    Permite volver a editar lo propuesto. Al confirmarla de nuevo, las etapas adicionales pasan a
                    ser parte de lo propuesto.
                  </span>
                </form>
              )}
            </div>
          ) : (
            canBudget && (
              <form action={confirmProjectBudget.bind(null, project.id)} className="mt-4 flex flex-wrap items-center gap-3">
                <SubmitButton className="rounded-md border border-[#0bdbcf] px-3 py-2 text-sm font-semibold text-[#065f5a] hover:bg-[#e0fbf9]">
                  Confirmar cubicación
                </SubmitButton>
                <span className="text-xs text-[#5d6b77]">
                  Congela lo propuesto (total y etapas). Las etapas que se agreguen después serán adicionales.
                </span>
              </form>
            )
          )}
          <p className="mt-3 text-[11px] text-[#7f7f7f]">
            Si se pasa de lo estimado el trabajo sigue: lo que excede queda marcado en rojo.
          </p>
        </section>

        <section className="rounded-xl border border-[#e4e8ec] bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold">Carta Gantt</h2>
          <ProjectGantt timeline={timeline} taskHref={(k) => `/solicitudes/${k}`} />
        </section>

        <section className="rounded-xl border border-[#e4e8ec] bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold">Comparativo por etapa: propuesto vs. real</h2>
          <StageComparison timeline={timeline} hoursByRequest={hoursByRequest} />
        </section>

        <section className="rounded-xl border border-[#e4e8ec] bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold">Comparativo de demoras</h2>
          <DelayComparison timeline={timeline} hoursByRequest={hoursByRequest} taskHref={(k) => `/solicitudes/${k}`} />
        </section>

        <section className="rounded-xl border border-[#e4e8ec] bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold">Etapas (parte de la cubicación)</h2>
          <p className="mb-3 text-xs text-[#5d6b77]">
            Son las mismas etapas que se usan en las tareas y en el Gantt.
            {proposedHours > 0 &&
              ` Las propuestas suman ${hoursLabel(proposedHours)}${
                project.estimatedHours ? ` de ${hoursLabel(project.estimatedHours)} estimadas` : ""
              }.`}
          </p>
          {project.stages.length === 0 ? (
            <p className="text-sm text-[#7f7f7f]">Aún no hay etapas.</p>
          ) : (
            <div className="space-y-2">
              {project.stages.map((s) => {
                const reqs = project.requests.filter((r) => r.stageId === s.id);
                const h = reqs.reduce((a, r) => a + hoursOf(r), 0);
                const sb = budgetStatus({
                  estimatedHours: s.estimatedHours,
                  consumedHours: h,
                  startDate: s.startDate,
                  endDate: s.endDate,
                  done: reqs.length > 0 && reqs.every((r) => finalCodes.has(r.status)),
                });
                return (
                  <details key={s.id} className="rounded-lg border border-[#f1f3f4] px-3 py-2">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-semibold">
                        {s.name}
                        {s.isAdditional && (
                          <span className="ml-2 rounded bg-[#efe9ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#5b3fd0]">
                            Adicional
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-[#5d6b77]">
                        {s.startDate && s.endDate ? `${shortDate(s.startDate)} → ${shortDate(s.endDate)} · ` : ""}
                        {reqs.length} tarea{reqs.length === 1 ? "" : "s"} · {hoursLabel(h)}
                        {sb.hasHours && ` de ${hoursLabel(s.estimatedHours!)}`}
                        {sb.redHours > 0 && (
                          <span className="ml-1 font-semibold text-[#d21f3c]">(+{hoursLabel(sb.redHours)} en rojo)</span>
                        )}
                        {sb.lateDays > 0 && (
                          <span className="ml-1 font-semibold text-[#d21f3c]">· {sb.lateDays} d atraso</span>
                        )}
                      </span>
                    </summary>
                    {(s.isAdditional ? canManage : canBudget) && (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <StageForm action={saveStage.bind(null, project.id, s.id)} stage={s} label="Guardar" min={frameMin} max={frameMax} />
                        <form action={deleteStage.bind(null, project.id, s.id)}>
                          <button className="rounded-md border border-[#e4e8ec] px-3 py-2 text-sm text-[#d21f3c] hover:bg-[#fdf2f4]">
                            Eliminar
                          </button>
                        </form>
                      </div>
                    )}
                  </details>
                );
              })}
              {noStage.length > 0 && (
                <div className="px-3 text-xs text-[#7f7f7f]">
                  Sin etapa: {noStage.length} tarea{noStage.length === 1 ? "" : "s"} ·{" "}
                  {hoursLabel(noStage.reduce((a, r) => a + hoursOf(r), 0))}
                </div>
              )}
            </div>
          )}
          {(project.baselineAt ? canManage : canBudget) && (
            <div className="mt-4 border-t border-[#f1f3f4] pt-4">
              <div className="mb-2 text-xs font-semibold text-[#5d6b77]">
                {project.baselineAt ? "Nueva etapa adicional (dentro del marco inicial)" : "Nueva etapa propuesta"}
              </div>
              <StageForm
                action={saveStage.bind(null, project.id, null)}
                label="Agregar etapa"
                min={frameMin}
                max={frameMax}
              />
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-[#5d6b77]">Tareas ({project.requests.length})</h2>
          <div className="overflow-x-auto rounded-xl border border-[#e4e8ec] bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[#e4e8ec] text-left text-xs text-[#5d6b77]">
                  <th className="px-4 py-2.5 font-semibold">Tarea</th>
                  <th className="px-4 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 font-semibold">Etapa</th>
                  <th className="px-4 py-2.5 font-semibold">Horas</th>
                </tr>
              </thead>
              <tbody>
                {project.requests.map((r) => (
                  <tr key={r.id} className="border-b border-[#f1f3f4] last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/solicitudes/${r.key}`}>
                        <div className="text-xs text-[#7f7f7f]">{r.key}</div>
                        <div className="max-w-xs truncate font-medium">{r.title}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      {canManage && project.stages.length > 0 ? (
                        <form action={setRequestStage.bind(null, r.id)} className="flex items-center gap-1">
                          <select name="stageId" defaultValue={r.stageId ?? ""} className="rounded-lg border border-[#e4e8ec] px-2 py-1.5 text-sm">
                            <option value="">Sin etapa</option>
                            {project.stages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <button className="rounded-md border border-[#e4e8ec] px-2 py-1.5 text-xs hover:bg-[#f8fafb]">OK</button>
                        </form>
                      ) : (
                        <span className="text-[#5d6b77]">
                          {project.stages.find((s) => s.id === r.stageId)?.name ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{hoursOf(r) > 0 ? hoursLabel(hoursOf(r)) : "—"}</td>
                  </tr>
                ))}
                {project.requests.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-[#7f7f7f]">
                      Aún no hay tareas en este proyecto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function StageForm({
  action,
  stage,
  label,
  min,
  max,
}: {
  action: (formData: FormData) => void | Promise<void>;
  stage?: { name: string; startDate: Date | null; endDate: Date | null; estimatedHours: number | null };
  label: string;
  // Marco de fechas del proyecto: guía el selector (el servidor también valida).
  min?: string;
  max?: string;
}) {
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div>
        <label className={labelCls}>Nombre</label>
        <input name="name" required defaultValue={stage?.name} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Inicio</label>
        <input name="startDate" type="date" min={min} max={max} defaultValue={stage?.startDate ? toDateInput(stage.startDate) : ""} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Término</label>
        <input name="endDate" type="date" min={min} max={max} defaultValue={stage?.endDate ? toDateInput(stage.endDate) : ""} className={inputCls} />
      </div>
      <div className="w-28">
        <label className={labelCls}>Horas est.</label>
        <input name="estimatedHours" type="number" min="0" step="0.5" defaultValue={stage?.estimatedHours ?? ""} className={inputCls} />
      </div>
      <SubmitButton className={btnCls}>{label}</SubmitButton>
    </form>
  );
}
