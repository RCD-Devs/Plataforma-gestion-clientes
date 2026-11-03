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
  initial: { weekdays: number[]; times: Record<number, string>; memberIds: string[] } | null;
  people: Person[];
}) {
  const [days, setDays] = useState<number[]>(initial?.weekdays ?? [1, 3, 5]);
  const [times, setTimes] = useState<Record<number, string>>(initial?.times ?? {});
  const timeOf = (d: number) => times[d] ?? "09:30";
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
        <span key={d}>
          <input type="hidden" name="weekdays" value={d} />
          <input type="hidden" name={`time_${d}`} value={timeOf(d)} />
        </span>
      ))}
      {shown.map((id) => (
        <input key={id} type="hidden" name="memberIds" value={id} />
      ))}

      <div>
        <span className={label}>Días y horario — cada día con su hora</span>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {DAYS.map(([d, name]) => {
            const on = days.includes(d);
            return (
              <div
                key={d}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition ${
                  on ? "border-[#081826] bg-white" : "border-[#e4e8ec] bg-[#fafbfc]"
                }`}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`Daily los ${name}`}
                  onClick={() => setDays((v) => (on ? v.filter((x) => x !== d) : [...v, d].sort()))}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-[#08a89f]" : "bg-[#d5dbe0]"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                </button>
                <span className={`w-9 text-sm font-semibold ${on ? "text-[#081826]" : "text-[#9aa3ad]"}`}>{name}</span>
                {on ? (
                  <input
                    type="time"
                    required
                    value={timeOf(d)}
                    onChange={(e) => setTimes((t) => ({ ...t, [d]: e.target.value }))}
                    aria-label={`Hora del ${name}`}
                    className="ml-auto h-8 rounded-lg border border-[#e4e8ec] px-2 text-sm tabular-nums outline-none focus:border-[#0bdbcf]"
                  />
                ) : (
                  <span className="ml-auto text-xs text-[#9aa3ad]">Sin daily</span>
                )}
              </div>
            );
          })}
        </div>
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
