"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  confirmScheduleBlockHours,
  createScheduleBlock,
  deleteScheduleBlock,
  updateScheduleBlock,
} from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { slugify } from "@/lib/slug";
import { REQUEST_TYPES, PRIORITIES } from "@/lib/constants";
import { WEEKDAY_LABELS, expectedHours, extraHours, weekdayIndex } from "@/lib/workSchedule";

export type CalendarBlock = {
  id: string;
  start: string; // ISO
  end: string; // ISO
  note: string | null;
  confirmed: boolean;
  request: { key: string; title: string; status: string; color: string };
};

export type CalendarTask = {
  id: string;
  key: string;
  title: string;
  clientName: string;
};

const START_HOUR = 0;
const END_HOUR = 24;
const PX_PER_MIN = 0.8; // 48px por hora — día completo sin quedar excesivamente largo
const MIN_DURATION_MIN = 15;

const fmtHours = (h: number) => h.toLocaleString("es-CL", { maximumFractionDigits: 2 });
const fmtTime = (d: Date) => d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// Inversa de topOf(): y=0 en la grilla es START_HOUR, no medianoche — hay
// que sumar ese desfase de vuelta, o cualquier clic aterriza 7 horas antes.
function minutesFromTop(dayStart: Date, y: number, snap = 15): Date {
  const raw = y / PX_PER_MIN;
  const snapped = Math.round(raw / snap) * snap;
  const clamped = Math.min(Math.max(snapped, 0), (END_HOUR - START_HOUR) * 60);
  return new Date(dayStart.getTime() + (START_HOUR * 60 + clamped) * 60000);
}

// Calendario (vista día o semana) de bloques de horario — arrastrar en vacío crea, sobre
// un bloque mueve, y del borde inferior redimensiona. Sin librería de drag:
// son pocos px con pointer events nativos, el mismo criterio que el Kanban.
export function PersonalCalendar({
  days: dayKeys,
  hoursByDay,
  workHours,
  blocks,
  tasks,
  clients,
}: {
  days: string[]; // "YYYY-MM-DD" de cada columna
  hoursByDay: Record<string, number>; // horas registradas (TimeEntry) por día
  workHours: number[]; // jornada esperada lun..dom
  blocks: CalendarBlock[];
  tasks: CalendarTask[];
  clients: {
    id: string;
    name: string;
    projects: { id: string; name: string }[];
  }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => dayKeys.map((k) => new Date(`${k}T00:00:00`)), [dayKeys]);

  const [items, setItems] = useState(() =>
    blocks.map((b) => ({
      ...b,
      startD: new Date(b.start),
      endD: new Date(b.end),
    })),
  );
  // Vuelve a sincronizar cuando el servidor trae datos nuevos (router.refresh()
  // tras crear/mover/eliminar un bloque), sin pisar un arrastre en curso.
  useEffect(() => {
    setItems(
      blocks.map((b) => ({
        ...b,
        startD: new Date(b.start),
        endD: new Date(b.end),
      })),
    );
  }, [blocks]);

  const [draft, setDraft] = useState<{
    day: number;
    start: Date;
    end: Date;
  } | null>(null);
  const [panel, setPanel] = useState<
    { kind: "create"; start: Date; end: Date } | { kind: "confirm"; block: (typeof items)[number] } | null
  >(null);
  const [warning, setWarning] = useState<string | null>(null);
  const dragState = useRef<
    | { kind: "create"; day: number; dayStart: Date; originY: number }
    | {
        kind: "move";
        id: string;
        originY: number;
        origStart: Date;
        durationMs: number;
      }
    | { kind: "resize"; id: string; day: number; dayStart: Date; origEnd: Date }
    | null
  >(null);

  const showOverlaps = (overlaps?: { key: string; title: string; start: string; end: string }[]) => {
    if (!overlaps || overlaps.length === 0) return;
    const list = overlaps.map((o) => `${o.key} (${fmtTime(new Date(o.start))}–${fmtTime(new Date(o.end))})`).join(", ");
    setWarning(`Se cruza en horario con: ${list}`);
  };

  function onGridPointerDown(dayIndex: number, dayStart: Date, e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("[data-block]")) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    dragState.current = { kind: "create", day: dayIndex, dayStart, originY: y };
    const t = minutesFromTop(dayStart, y);
    setDraft({
      day: dayIndex,
      start: t,
      end: new Date(t.getTime() + 30 * 60000),
    });
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onBlockPointerDown(block: (typeof items)[number], e: React.PointerEvent) {
    e.stopPropagation();
    dragState.current = {
      kind: "move",
      id: block.id,
      originY: e.clientY,
      origStart: block.startD,
      durationMs: block.endD.getTime() - block.startD.getTime(),
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onResizePointerDown(block: (typeof items)[number], dayIndex: number, dayStart: Date, e: React.PointerEvent) {
    e.stopPropagation();
    dragState.current = {
      kind: "resize",
      id: block.id,
      day: dayIndex,
      dayStart,
      origEnd: block.endD,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  // Rect del área de horas de un día (sin el encabezado) — la única
  // referencia válida para convertir clientY en minutos desde las 07:00.
  function dayGridRect(day: number) {
    return gridRef.current?.querySelector(`[data-daygrid="${day}"]`)?.getBoundingClientRect() ?? null;
  }

  function onPointerMove(e: React.PointerEvent) {
    const st = dragState.current;
    if (!st) return;
    if (st.kind === "create") {
      const rect = dayGridRect(st.day);
      if (!rect) return;
      const y = e.clientY - rect.top;
      const a = minutesFromTop(st.dayStart, Math.min(y, st.originY));
      const b = minutesFromTop(st.dayStart, Math.max(y, st.originY));
      setDraft({
        day: st.day,
        start: a,
        end: b.getTime() > a.getTime() ? b : new Date(a.getTime() + MIN_DURATION_MIN * 60000),
      });
    } else if (st.kind === "move") {
      const deltaMin = (e.clientY - st.originY) / PX_PER_MIN;
      const snapped = Math.round(deltaMin / 15) * 15;
      const newStart = new Date(st.origStart.getTime() + snapped * 60000);
      const newEnd = new Date(newStart.getTime() + st.durationMs);
      setItems((prev) => prev.map((b) => (b.id === st.id ? { ...b, startD: newStart, endD: newEnd } : b)));
    } else if (st.kind === "resize") {
      const rect = dayGridRect(st.day);
      if (!rect) return;
      const y = e.clientY - rect.top;
      const newEnd = minutesFromTop(st.dayStart, y, 15);
      setItems((prev) =>
        prev.map((b) =>
          b.id === st.id && newEnd.getTime() > b.startD.getTime() + MIN_DURATION_MIN * 60000
            ? { ...b, endD: newEnd }
            : b,
        ),
      );
    }
  }

  function onPointerUp() {
    const st = dragState.current;
    dragState.current = null;
    if (!st) return;
    if (st.kind === "create") {
      if (draft) setPanel({ kind: "create", start: draft.start, end: draft.end });
      setDraft(null);
    } else if (st.kind === "move" || st.kind === "resize") {
      const block = items.find((b) => b.id === st.id);
      if (!block) return;
      startTransition(async () => {
        const res = await updateScheduleBlock(st.id, toLocalInput(block.startD), toLocalInput(block.endD));
        if (res.ok) {
          showOverlaps(res.overlaps);
          router.refresh();
        } else {
          router.refresh(); // revierte al estado del servidor si falló
        }
      });
    }
  }

  async function onCreate(formData: FormData) {
    const res = await createScheduleBlock(formData);
    if (res.ok) {
      setPanel(null);
      showOverlaps(res.overlaps);
      router.refresh();
    }
  }

  async function onDelete(id: string) {
    setPanel(null);
    await deleteScheduleBlock(id);
    router.refresh();
  }

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const gridHeight = (END_HOUR - START_HOUR) * 60 * PX_PER_MIN;
  const topOf = (d: Date) => ((d.getHours() - START_HOUR) * 60 + d.getMinutes()) * PX_PER_MIN;
  const heightOf = (a: Date, b: Date) => Math.max(((b.getTime() - a.getTime()) / 60000) * PX_PER_MIN, 18);

  // Día completo (00:00-24:00): abre centrado en la hora actual en vez de
  // arrancar desde medianoche cada vez.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(topOf(new Date()) - el.clientHeight / 2, 0);
  }, [dayKeys[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const overlapIds = useMemo(() => {
    const bad = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (items[i].startD < items[j].endD && items[j].startD < items[i].endD) {
          bad.add(items[i].id);
          bad.add(items[j].id);
        }
      }
    }
    return bad;
  }, [items]);

  return (
    <div>
      {warning && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[#fda565] bg-[#fdf1e3] px-3 py-2 text-sm text-[#9a5a25]">
          <span>⚠️ {warning}</span>
          <button onClick={() => setWarning(null)} className="shrink-0 text-xs hover:underline">
            Cerrar
          </button>
        </div>
      )}
      <div ref={scrollRef} className="max-h-[75vh] overflow-auto rounded-xl border border-[#e4e8ec] bg-white">
        <div className={`flex ${days.length > 1 ? "min-w-[820px]" : ""}`}>
          <div className="w-14 shrink-0 border-r border-[#f1f3f4]">
            <div className="h-16 border-b border-[#f1f3f4]" />
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: 60 * PX_PER_MIN }}
                className="border-b border-[#f6f7f8] pr-1.5 text-right text-[10px] text-[#9aa5ad]"
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          <div
            ref={gridRef}
            className="grid flex-1"
            style={{
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {days.map((day, i) => {
              const dayStart = new Date(day);
              const dayEnd = new Date(day);
              dayEnd.setDate(dayEnd.getDate() + 1);
              const dayBlocks = items.filter((b) => b.startD >= dayStart && b.startD < dayEnd);
              const isToday = new Date().toDateString() === day.toDateString();
              const registered = hoursByDay[dayKeys[i]] ?? 0;
              const expected = expectedHours(workHours, dayKeys[i]);
              const extra = extraHours(registered, expected);
              return (
                <div key={i} data-col className="border-r border-[#f1f3f4] last:border-r-0">
                  <div
                    className={`flex h-16 flex-col items-center justify-center border-b border-[#f1f3f4] text-xs ${isToday ? "bg-[#e0fbf9] font-semibold text-[#065f5a]" : "text-[#5d6b77]"}`}
                  >
                    <span>
                      {WEEKDAY_LABELS[weekdayIndex(dayKeys[i])]} {day.getDate()}
                    </span>
                    <DayHours registered={registered} expected={expected} extra={extra} />
                  </div>
                  <div
                    data-daygrid={i}
                    className="relative cursor-crosshair"
                    style={{ height: gridHeight }}
                    onPointerDown={(e) => onGridPointerDown(i, dayStart, e)}
                  >
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="absolute inset-x-0 border-b border-[#f6f7f8]"
                        style={{ top: (h - START_HOUR) * 60 * PX_PER_MIN }}
                      />
                    ))}
                    {isToday && (
                      <div
                        className="absolute inset-x-0 z-10 border-t-2 border-[#fb693b]"
                        style={{ top: topOf(new Date()) }}
                      >
                        <span className="absolute -left-1 -top-[5px] h-2.5 w-2.5 rounded-full bg-[#fb693b]" />
                      </div>
                    )}
                    {draft && draft.day === i && (
                      <div
                        className="absolute inset-x-1 rounded-md border-2 border-dashed border-[#0bdbcf] bg-[#0bdbcf]/10"
                        style={{
                          top: topOf(draft.start),
                          height: heightOf(draft.start, draft.end),
                        }}
                      />
                    )}
                    {dayBlocks.map((b) => (
                      <div
                        key={b.id}
                        data-block
                        onPointerDown={(e) => onBlockPointerDown(b, e)}
                        onClick={() => !dragState.current && setPanel({ kind: "confirm", block: b })}
                        className={`group absolute inset-x-1 cursor-grab select-none overflow-hidden rounded-md border px-1.5 py-1 text-[11px] leading-tight text-white active:cursor-grabbing ${b.confirmed ? "opacity-70" : ""}`}
                        style={{
                          top: topOf(b.startD),
                          height: heightOf(b.startD, b.endD),
                          background: b.request.color,
                          borderColor: b.request.color,
                        }}
                        title={`${b.request.key} · ${b.request.title}\n${fmtTime(b.startD)}–${fmtTime(b.endD)}`}
                      >
                        <div className="flex items-center gap-1 font-semibold">
                          {overlapIds.has(b.id) && <span title="Se cruza con otro bloque">⚠️</span>}
                          {b.confirmed && <span title="Ya registrado como horas">✓</span>}
                          <span className="truncate">{b.request.key}</span>
                        </div>
                        <div className="truncate">{b.request.title}</div>
                        <div className="text-[10px] opacity-90">
                          {fmtTime(b.startD)}–{fmtTime(b.endD)}
                        </div>
                        <div
                          onPointerDown={(e) => onResizePointerDown(b, i, dayStart, e)}
                          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize bg-black/10 opacity-0 group-hover:opacity-100"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-[#7f7f7f]">
        Arrastra sobre una columna vacía para crear un bloque, arrastra un bloque para moverlo, y su borde inferior para
        ajustar la duración. Los bloques pueden cruzarse: solo se avisa, no se bloquea.
      </p>

      {panel?.kind === "create" && (
        <BlockFormModal
          start={panel.start}
          end={panel.end}
          tasks={tasks}
          clients={clients}
          onClose={() => setPanel(null)}
          onSubmit={onCreate}
        />
      )}
      {panel?.kind === "confirm" && (
        <ConfirmBlockModal block={panel.block} onClose={() => setPanel(null)} onDelete={onDelete} />
      )}
    </div>
  );
}

// "9,5/8,5 h" + horas extra si se pasó de la jornada. Se usa también en la
// vista mensual.
export function DayHours({ registered, expected, extra }: { registered: number; expected: number; extra: number }) {
  if (registered === 0 && expected === 0) return null;
  const done = registered >= expected;
  return (
    <span className="text-[10px] leading-tight" title="Horas registradas / jornada del día">
      <span className={done ? "font-semibold text-[#0a7a52]" : "text-[#7f7f7f]"}>
        {fmtHours(registered)}/{fmtHours(expected)} h
      </span>
      {extra > 0 && <span className="block font-semibold text-[#9a5a25]">+{fmtHours(extra)} h extra</span>}
    </span>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-brand text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-[#7f7f7f] hover:text-[#081826]">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";
const labelCls = "mb-1 block text-xs font-semibold text-[#5d6b77]";

const MAX_TASK_OPTIONS = 6;

// Buscador de tareas: escribir filtra por folio, título o cliente (sin
// tildes, palabras en cualquier orden) y muestra a lo más 6 opciones.
function TaskPicker({ tasks }: { tasks: CalendarTask[] }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<CalendarTask | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const index = useMemo(
    () => tasks.map((t) => ({ t, text: slugify(`${t.key} ${t.title} ${t.clientName}`) })),
    [tasks],
  );
  const words = slugify(query).split("-").filter(Boolean);
  const matches = index
    .filter((x) => words.every((w) => x.text.includes(w)))
    .slice(0, MAX_TASK_OPTIONS)
    .map((x) => x.t);

  function pick(t: CalendarTask) {
    setPicked(t);
    setOpen(false);
    setQuery("");
  }

  if (picked)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[#0bdbcf] bg-[#f0fdfc] px-3 py-2 text-sm">
        <input type="hidden" name="requestId" value={picked.id} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{picked.title}</div>
          <div className="truncate text-xs text-[#5d6b77]">
            {picked.key} · {picked.clientName}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setPicked(null);
            setOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="shrink-0 text-xs font-semibold text-[#08a89f] hover:underline"
        >
          Cambiar
        </button>
      </div>
    );

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        required
        autoFocus
        autoComplete="off"
        placeholder="Busca por folio, título o cliente…"
        className={inputCls}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls="task-options"
        // Escribir sin elegir no basta: el form exige una tarea de la lista.
        onInvalid={(e) => e.currentTarget.setCustomValidity("Elige una tarea de la lista")}
        onChange={(e) => {
          e.currentTarget.setCustomValidity("");
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const d = e.key === "ArrowDown" ? 1 : -1;
            setActive((a) => (a + d + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[active]);
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul
          id="task-options"
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-[#e4e8ec] bg-white py-1 shadow-lg"
        >
          {matches.map((t, i) => (
            <li
              key={t.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(t);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? "bg-[#e0fbf9]" : ""}`}
            >
              <div className="truncate text-sm">{t.title}</div>
              <div className="truncate text-xs text-[#5d6b77]">
                {t.key} · {t.clientName}
              </div>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-2 text-xs text-[#6b7280]">Sin resultados para “{query}”.</li>
          )}
        </ul>
      )}
    </div>
  );
}

function BlockFormModal({
  start,
  end,
  tasks,
  clients,
  onClose,
  onSubmit,
}: {
  start: Date;
  end: Date;
  tasks: CalendarTask[];
  clients: {
    id: string;
    name: string;
    projects: { id: string; name: string }[];
  }[];
  onClose: () => void;
  onSubmit: (formData: FormData) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"existing" | "new">(tasks.length > 0 ? "existing" : "new");
  const [clientId, setClientId] = useState("");
  const projects = clients.find((c) => c.id === clientId)?.projects ?? [];

  return (
    <Modal title="Nuevo bloque de horario" onClose={onClose}>
      <form action={onSubmit} className="space-y-3">
        <input type="hidden" name="start" value={toLocalInput(start)} />
        <input type="hidden" name="end" value={toLocalInput(end)} />
        <div className="rounded-lg bg-[#f4f6f8] px-3 py-2 text-sm text-[#5d6b77]">
          {start.toLocaleDateString("es-CL", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}{" "}
          · {fmtTime(start)}–{fmtTime(end)}
        </div>

        <div role="tablist" className="inline-flex gap-1 rounded-lg border border-[#e4e8ec] p-1">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${mode === "existing" ? "bg-[#081826] text-white" : "text-[#5d6b77]"}`}
          >
            Tarea existente
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${mode === "new" ? "bg-[#081826] text-white" : "text-[#5d6b77]"}`}
          >
            Nueva tarea
          </button>
        </div>
        <input type="hidden" name="mode" value={mode} />

        {mode === "existing" ? (
          <div>
            <label className={labelCls}>Tarea</label>
            <TaskPicker tasks={tasks} />
          </div>
        ) : (
          <>
            <div>
              <label className={labelCls}>Cliente</label>
              <select
                name="clientId"
                required
                className={inputCls}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
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
            </div>
            {projects.length > 0 && (
              <div>
                <label className={labelCls}>Proyecto / sitio</label>
                <select name="projectId" className={inputCls} defaultValue="">
                  <option value="">General</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={labelCls}>Título</label>
              <input name="title" required className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Tipo</label>
                <select name="type" defaultValue={REQUEST_TYPES[0]} className={inputCls}>
                  {REQUEST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Prioridad</label>
                <select name="priority" defaultValue="MEDIA" className={inputCls}>
                  {PRIORITIES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Descripción</label>
              <textarea name="description" rows={2} className={inputCls} />
            </div>
          </>
        )}

        <div>
          <label className={labelCls}>Nota del bloque (opcional)</label>
          <input name="note" placeholder="Ej. avanzar diseño home" className={inputCls} />
        </div>

        <div className="flex gap-2 pt-1">
          <SubmitButton className="rounded-md bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
            Crear bloque
          </SubmitButton>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#e4e8ec] px-4 py-2 text-sm text-[#5d6b77]"
          >
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmBlockModal({
  block,
  onClose,
  onDelete,
}: {
  block: {
    id: string;
    startD: Date;
    endD: Date;
    note: string | null;
    confirmed: boolean;
    request: { key: string; title: string; status: string };
  };
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // Redondeado al cuarto de hora (no al décimo): los bloques ya quedan
  // alineados a 15 min, pero 3.75 h redondeado a 1 decimal da 3.8 — un
  // valor que el input (step="0.25") rechaza, pidiendo 3.75 o 4.
  const durationH = Math.round((block.endD.getTime() - block.startD.getTime()) / 3600000 / 0.25) * 0.25;

  return (
    <Modal title={`${block.request.key} · ${block.request.title}`} onClose={onClose}>
      <div className="mb-3 text-sm text-[#5d6b77]">
        {fmtTime(block.startD)} – {fmtTime(block.endD)} · {durationH} h
        {block.note && <div className="mt-1 italic">&ldquo;{block.note}&rdquo;</div>}
      </div>
      <Link
        href={`/solicitudes/${block.request.key}`}
        className="mb-4 inline-block text-xs text-[#08a89f] hover:underline"
      >
        Ver tarea →
      </Link>

      {block.confirmed ? (
        <p className="rounded-lg bg-[#e3f6ee] px-3 py-2 text-sm text-[#0a7a52]">
          Ya se registró como horas trabajadas.
        </p>
      ) : (
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await confirmScheduleBlockHours(block.id, fd);
              if (res.ok) {
                onClose();
                router.refresh();
              }
            })
          }
          className="space-y-3 border-t border-[#f1f3f4] pt-3"
        >
          <div className="text-xs font-semibold text-[#5d6b77]">Registrar como horas trabajadas</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Horas</label>
              <input
                name="hours"
                type="number"
                step="0.25"
                min="0.25"
                defaultValue={durationH}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Fecha</label>
              <input
                name="date"
                type="date"
                defaultValue={`${block.startD.getFullYear()}-${String(block.startD.getMonth() + 1).padStart(2, "0")}-${String(block.startD.getDate()).padStart(2, "0")}`}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Nota</label>
            <input name="note" defaultValue={block.note ?? ""} className={inputCls} />
          </div>
          <button
            disabled={pending}
            className="w-full rounded-md bg-[#0bdbcf] py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba] disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Registrar horas"}
          </button>
        </form>
      )}

      <button
        onClick={() => onDelete(block.id)}
        className="mt-4 w-full rounded-md border border-[#f1c3c9] py-2 text-xs text-[#d21f3c] hover:bg-[#fdeef0]"
      >
        Eliminar bloque
      </button>
    </Modal>
  );
}
