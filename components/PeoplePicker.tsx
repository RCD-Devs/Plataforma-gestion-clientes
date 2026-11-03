"use client";

import { useId, useState } from "react";
import { slugify } from "@/lib/slug";

type Person = { id: string; name: string };

// Selección de varias personas (participantes): chips con ✕ + buscador.
// Envía un input hidden `name` por cada persona elegida.
export function PeoplePicker({
  people,
  name,
  initial = [],
  exclude = [],
}: {
  people: Person[];
  name: string;
  initial?: string[];
  exclude?: string[]; // ej. el responsable: ya está involucrado
}) {
  const [ids, setIds] = useState<string[]>(initial);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const byId = new Map(people.map((p) => [p.id, p]));
  const chosen = ids.filter((id) => byId.has(id) && !exclude.includes(id));
  const words = slugify(query).split("-").filter(Boolean);
  const matches = people
    .filter((p) => !chosen.includes(p.id) && !exclude.includes(p.id))
    .filter((p) => words.every((w) => slugify(p.name).includes(w)))
    .slice(0, 6);

  const add = (id: string) => {
    setIds((v) => [...v, id]);
    setQuery("");
    setActive(0);
  };

  return (
    <div className="relative">
      <div className="flex min-h-[38px] flex-wrap items-center gap-1 rounded-lg border border-[#e4e8ec] bg-white px-1.5 py-1 focus-within:border-[#0bdbcf]">
        {chosen.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#eef1f4] py-0.5 pl-2 pr-1 text-xs font-medium text-[#081826]">
            <input type="hidden" name={name} value={id} />
            {byId.get(id)!.name}
            <button
              type="button"
              aria-label={`Quitar a ${byId.get(id)!.name}`}
              onClick={() => setIds((v) => v.filter((x) => x !== id))}
              className="grid h-4 w-4 place-items-center rounded-full text-[10px] text-[#5d6b77] hover:bg-[#d5dbe0] hover:text-[#081826]"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={query}
          autoComplete="off"
          placeholder={chosen.length ? "" : "Agregar personas…"}
          aria-label="Agregar participante"
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !query && chosen.length) {
              setIds((v) => v.slice(0, -1));
            } else if (open && matches.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              const d = e.key === "ArrowDown" ? 1 : -1;
              setActive((a) => (a + d + matches.length) % matches.length);
            } else if (e.key === "Enter") {
              e.preventDefault(); // nunca envía el formulario desde acá
              if (open && matches[active]) add(matches[active].id);
            }
          }}
        />
      </div>
      {open && matches.length > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-[#e4e8ec] bg-white py-1 shadow-lg">
          {matches.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                add(p.id);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${i === active ? "bg-[#e0fbf9]" : ""}`}
            >
              {p.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
