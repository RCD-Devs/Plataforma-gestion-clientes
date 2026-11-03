"use client";

import { useState } from "react";
import { saveDailySeries } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";

type Person = { id: string; name: string; inTeam: boolean };

const DAYS = [
  [1, "Lun"],
  [2, "Mar"],
  [3, "Mié"],
  [4, "Jue"],
  [5, "Vie"],
  [6, "Sáb"],
  [7, "Dom"],
] as const;

const label = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#7f7f7f]";
const iconBtn =
  "grid h-7 w-7 place-items-center rounded-md text-xs text-[#5d6b77] hover:bg-[#eef1f4] hover:text-[#081826] disabled:opacity-30 disabled:hover:bg-transparent";

// Configuración de la daily de un equipo: días, hora y orden de rotación
// (quién la lidera, en ese orden; se puede reordenar con ↑ ↓).
export function DailySeriesForm({
  teamId,
  initial,
  people,
}: {
  teamId: string;
  initial: { weekdays: number[]; time: string; memberIds: string[] } | null;
  people: Person[];
}) {
  const [days, setDays] = useState<number[]>(initial?.weekdays ?? [1, 3, 5]);
  const [order, setOrder] = useState<string[]>(
    initial?.memberIds ?? people.filter((p) => p.inTeam).map((p) => p.id),
  );
  const byId = new Map(people.map((p) => [p.id, p]));
  const shown = order.filter((id) => byId.has(id));
  const rest = people.filter((p) => !shown.includes(p.id));

  const move = (i: number, d: number) =>
    setOrder((o) => {
      const next = o.filter((id) => byId.has(id));
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  return (
    <form action={saveDailySeries} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />
      {days.map((d) => (
        <input key={d} type="hidden" name="weekdays" value={d} />
      ))}
      {shown.map((id) => (
        <input key={id} type="hidden" name="memberIds" value={id} />
      ))}

      <div className="flex flex-wrap items-end gap-6">
        <div>
          <span className={label}>Días</span>
          <div className="flex gap-1">
            {DAYS.map(([d, name]) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays((v) => (on ? v.filter((x) => x !== d) : [...v, d].sort()))}
                  className={`h-9 w-11 rounded-lg border text-xs font-semibold transition ${
                    on ? "border-[#081826] bg-[#081826] text-white" : "border-[#e4e8ec] bg-white text-[#5d6b77] hover:border-[#c3ccd4]"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
        <label>
          <span className={label}>Hora</span>
          <input
            type="time"
            name="time"
            required
            defaultValue={initial?.time ?? "09:30"}
            className="h-9 rounded-lg border border-[#e4e8ec] px-3 text-sm outline-none focus:border-[#0bdbcf]"
          />
        </label>
      </div>

      <div>
        <span className={label}>Rotación — quién lidera, en este orden</span>
        {shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#d5dbe0] px-3 py-4 text-center text-xs text-[#7f7f7f]">
            Agrega al menos una persona para que se planifique.
          </p>
        ) : (
          <ol className="divide-y divide-[#f1f3f4] rounded-xl border border-[#e4e8ec] bg-white">
            {shown.map((id, i) => (
              <li key={id} className="flex items-center gap-3 px-3 py-1.5">
                <span className="w-5 text-right text-xs font-semibold tabular-nums text-[#9aa3ad]">{i + 1}</span>
                <span className="flex-1 truncate text-sm">{byId.get(id)!.name}</span>
                <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn}>
                  ↑
                </button>
                <button type="button" aria-label="Bajar" disabled={i === shown.length - 1} onClick={() => move(i, 1)} className={iconBtn}>
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Quitar a ${byId.get(id)!.name}`}
                  onClick={() => setOrder((o) => o.filter((x) => x !== id))}
                  className={`${iconBtn} hover:bg-[#fdeef0]! hover:text-[#a01830]!`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
        )}
        {rest.length > 0 && (
          <div className="relative mt-2 inline-block">
            <select
              value=""
              aria-label="Agregar persona a la rotación"
              onChange={(e) => e.target.value && setOrder((o) => [...o.filter((id) => byId.has(id)), e.target.value])}
              className="appearance-none rounded-lg border border-[#e4e8ec] bg-white py-1.5 pl-3 pr-8 text-sm text-[#5d6b77] outline-none hover:border-[#c3ccd4] focus:border-[#0bdbcf]"
            >
              <option value="">+ Agregar persona…</option>
              {rest.some((p) => p.inTeam) && (
                <optgroup label="Del equipo">
                  {rest.filter((p) => p.inTeam).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Otras personas">
                {rest.filter((p) => !p.inTeam).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            </select>
            <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#5d6b77]">
              ▼
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f1f3f4] pt-4">
        <p className="text-xs text-[#7f7f7f]">
          Al guardar se replanifica desde hoy. Las fechas cambiadas a mano y las que ya tienen acuerdos no se tocan; los feriados se cancelan solos.
        </p>
        <SubmitButton pendingLabel="Guardando…" className="rounded-lg bg-[#081826] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0e2436]">
          {initial ? "Guardar y replanificar" : "Crear daily"}
        </SubmitButton>
      </div>
    </form>
  );
}
