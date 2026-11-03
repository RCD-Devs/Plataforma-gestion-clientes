"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { createFollowUp, searchRequestsForPicker, updateFollowUp } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { TaskPicker, type PickerTask } from "@/components/TaskPicker";
import { PeoplePicker } from "@/components/PeoplePicker";
import { addDaysKey, daysToNextMonday, dueLabel } from "@/lib/followUps";

type Option = { id: string; name: string };
export type MeetingOption = { id: string; label: string };
export type FollowUpInitial = {
  id: string;
  text: string;
  dueKey: string;
  assigneeId: string;
  participantIds: string[];
  waitingOnId: string | null;
  clientId: string | null;
  meetingId: string | null;
  request: PickerTask | null;
};

const fieldCls =
  "w-full rounded-lg border border-[#e4e8ec] bg-white px-3 py-2 text-sm outline-none focus:border-[#0bdbcf] disabled:bg-[#f4f6f8] disabled:text-[#9aa3ad]";

// <select> nativo (accesible, sin librería) con flecha propia.
function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <span className={`relative block ${className}`}>
      <select {...props} className={`${fieldCls} appearance-none pr-8`} />
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#5d6b77]">
        ▼
      </span>
    </span>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#7f7f7f]">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-[#9aa3ad]">{hint}</div>}
    </div>
  );
}

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-semibold transition ${
    on ? "border-[#081826] bg-[#081826] text-white" : "border-[#e4e8ec] bg-white text-[#5d6b77] hover:border-[#c3ccd4] hover:text-[#081826]"
  }`;

type Props = {
  mode: "create" | "edit";
  initial?: FollowUpInitial;
  todayKey: string; // día en Chile, calculado en el servidor
  meId: string;
  people: Option[];
  clients: Option[];
  meetings: MeetingOption[];
  defaultMeetingId?: string; // al crear: la reunión de hoy, si ya hay una
  onDone?: () => void;
};

// Anotar (mode="create") o editar (mode="edit") un seguimiento. Orden:
// qué y cuándo → quiénes (responsable, participantes, esperando a) →
// contexto (reunión, solicitud, cliente). Tras crear, el formulario se
// vuelve a montar entero (key) para quedar en blanco.
export function FollowUpForm(props: Props) {
  const [round, setRound] = useState(0);
  return <FormBody key={round} {...props} onCreated={() => setRound((r) => r + 1)} />;
}

function FormBody({
  mode,
  initial,
  todayKey,
  meId,
  people,
  clients,
  meetings,
  defaultMeetingId = "",
  onDone,
  onCreated,
}: Props & { onCreated: () => void }) {
  const quick = [
    { label: "Hoy", key: todayKey },
    { label: "Mañana", key: addDaysKey(todayKey, 1) },
    { label: "Próximo lunes", key: addDaysKey(todayKey, daysToNextMonday(todayKey)) },
  ];
  const [date, setDate] = useState(initial?.dueKey ?? quick[1].key);
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? meId);
  const [meetingId, setMeetingId] = useState(initial ? (initial.meetingId ?? "") : defaultMeetingId);
  const [request, setRequest] = useState<PickerTask | null>(initial?.request ?? null);
  // La reunión recién creada llega por props después de guardar: los
  // siguientes seguimientos caen en ella sin volver a elegirla.
  useEffect(() => {
    if (mode === "create" && defaultMeetingId) setMeetingId(defaultMeetingId);
  }, [mode, defaultMeetingId]);
  const custom = !quick.some((q) => q.key === date);
  // Una reunión que ya no está en la lista (antigua) se mantiene al editar.
  const meetingOptions =
    initial?.meetingId && !meetings.some((m) => m.id === initial.meetingId)
      ? [{ id: initial.meetingId, label: "Reunión anterior" }, ...meetings]
      : meetings;

  return (
    <form
      action={async (fd) => {
        await (mode === "edit" ? updateFollowUp(fd) : createFollowUp(fd));
        if (mode === "create") onCreated();
        onDone?.();
      }}
      className={
        mode === "create"
          ? "rounded-2xl border border-[#e4e8ec] bg-white shadow-sm"
          : ""
      }
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="date" value={date} />

      <div className="space-y-4 p-4">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#7f7f7f]">Seguimiento</span>
          <textarea
            name="text"
            required
            maxLength={500}
            rows={3}
            autoFocus={mode === "create"}
            defaultValue={initial?.text}
            placeholder="¿A qué hay que hacerle seguimiento? Ej: preguntarle a Juan si el cliente aprobó la maqueta"
            className="block min-h-[5.5rem] w-full resize-y rounded-lg border border-[#d5dbe0] bg-[#fafbfc] px-3 py-2.5 text-[15px] leading-relaxed outline-none transition placeholder:text-[#9aa3ad] hover:border-[#c3ccd4] focus:border-[#0bdbcf] focus:bg-white focus:ring-4 focus:ring-[#0bdbcf]/15"
            onKeyDown={(e) => {
              // Enter = salto de línea (nativo). Ctrl/⌘+Enter guarda.
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-[#7f7f7f]">Fecha</span>
          {quick.map((q) => (
            <button key={q.label} type="button" onClick={() => setDate(q.key)} className={chip(date === q.key)}>
              {q.label}
            </button>
          ))}
          <label className={`${chip(custom)} relative cursor-pointer first-letter:uppercase`}>
            {custom ? dueLabel(date, todayKey) : "Otra fecha…"}
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              // Invisible encima del chip: el clic abre el calendario del navegador.
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Elegir otra fecha"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Responsable">
            <Select name="assigneeId" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.id === meId ? `Yo (${p.name})` : p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Participantes">
            <PeoplePicker people={people} name="participantIds" initial={initial?.participantIds} exclude={[assigneeId]} />
          </Field>
          <Field label="Esperando a">
            <Select name="waitingOnId" defaultValue={initial?.waitingOnId ?? ""}>
              <option value="">Nadie</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Reunión">
            <Select name="meetingId" value={meetingId} onChange={(e) => setMeetingId(e.target.value)}>
              <option value="">Sin reunión</option>
              {meetingOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
              <option value="new">+ Nueva reunión…</option>
            </Select>
          </Field>
          <Field label="Solicitud">
            <TaskPicker
              search={searchRequestsForPicker}
              required={false}
              autoFocus={false}
              initial={initial?.request ?? null}
              onChange={setRequest}
            />
          </Field>
          <Field label="Cliente" hint={request ? "Se toma de la solicitud" : undefined}>
            <Select name="clientId" defaultValue={initial?.clientId ?? ""} disabled={!!request}>
              <option value="">{request ? request.clientName : "Sin cliente"}</option>
              {!request &&
                clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </Select>
          </Field>

          {meetingId === "new" && (
            <div className="grid gap-3 rounded-xl bg-[#f4f7f9] p-3 sm:col-span-3 sm:grid-cols-[1fr_auto]">
              <Field label="Nombre de la reunión">
                <input name="meetingTitle" maxLength={120} placeholder="Ej: Daily, Reunión de equipo, Comité con cliente…" className={fieldCls} />
              </Field>
              <Field label="Fecha de la reunión">
                <input type="date" name="meetingDate" defaultValue={todayKey} required className={fieldCls} />
              </Field>
            </div>
          )}
        </div>
      </div>

      <div
        className={`flex items-center justify-end gap-2 border-t border-[#f1f3f4] px-4 py-3 ${
          mode === "create" ? "rounded-b-2xl bg-[#fafbfc]" : ""
        }`}
      >
        {mode === "create" && <span className="mr-auto hidden text-[11px] text-[#9aa3ad] sm:inline">Ctrl + Enter para guardar</span>}
        {onDone && mode === "edit" && (
          <button type="button" onClick={onDone} className="rounded-lg px-4 py-2 text-sm font-semibold text-[#5d6b77] hover:bg-[#f1f3f4]">
            Cancelar
          </button>
        )}
        <SubmitButton pendingLabel="Guardando…" className="rounded-lg bg-[#081826] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0e2436]">
          {mode === "edit" ? "Guardar cambios" : "Agregar seguimiento"}
        </SubmitButton>
      </div>
    </form>
  );
}
