"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { slugify } from "@/lib/slug";

export type PickerTask = { id: string; key: string; title: string; clientName: string };

const MAX_TASK_OPTIONS = 6;
const inputCls = "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

// Buscador de tareas: escribir filtra por folio, título o cliente y
// muestra a lo más 6 opciones. Dos modos:
// - `tasks`: lista ya cargada, filtra en el navegador (sin tildes,
//   palabras en cualquier orden) — Calendario, pocas tareas propias.
// - `search`: consulta al servidor mientras se escribe (con debounce) —
//   para cuando la lista completa sería demasiado grande (Seguimientos).
export function TaskPicker({
  tasks,
  search,
  name = "requestId",
  required = true,
  autoFocus = true,
  initial = null,
  onChange,
}: {
  tasks?: PickerTask[];
  search?: (q: string) => Promise<PickerTask[]>;
  name?: string;
  required?: boolean;
  autoFocus?: boolean;
  initial?: PickerTask | null;
  onChange?: (t: PickerTask | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PickerTask | null>(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<PickerTask[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const index = useMemo(
    () => (tasks ?? []).map((t) => ({ t, text: slugify(`${t.key} ${t.title} ${t.clientName}`) })),
    [tasks],
  );
  const words = slugify(query).split("-").filter(Boolean);
  const matches = search
    ? (remote ?? [])
    : index
        .filter((x) => words.every((w) => x.text.includes(w)))
        .slice(0, MAX_TASK_OPTIONS)
        .map((x) => x.t);

  useEffect(() => {
    if (!search || !open) return;
    let stale = false; // descarta respuestas que llegan después de seguir escribiendo
    const timer = setTimeout(() => {
      search(query)
        .then((r) => !stale && setRemote(r))
        .catch(() => !stale && setRemote([]));
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [search, query, open]);

  function pick(t: PickerTask) {
    setPicked(t);
    setOpen(false);
    setQuery("");
    onChange?.(t);
  }

  if (picked)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[#0bdbcf] bg-[#f0fdfc] px-3 py-2 text-sm">
        <input type="hidden" name={name} value={picked.id} />
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
            onChange?.(null);
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
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Busca por folio, título o cliente…"
        className={inputCls}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={`${name}-options`}
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
      {open && (search ? remote !== null : true) && (
        <ul
          id={`${name}-options`}
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
