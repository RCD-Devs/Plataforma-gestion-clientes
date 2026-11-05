"use client";

import { useState } from "react";
import { logHours } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { durationToMinutes } from "@/lib/format";

const fieldCls =
  "rounded-lg border border-[#e6e8eb] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";
const inputCls = `w-full ${fieldCls}`;

const MODES = [
  { value: "range", label: "Hasta" },
  { value: "duration", label: "Duración" },
] as const;

const LAST_MINUTE_OF_DAY = 24 * 60 - 1;
const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Carga de horas desde la ficha. Toda carga queda en un bloque del calendario
// de quien carga (/perfil): siempre se indica el inicio, y el fin se escribe
// ("Hasta") o se calcula con la duración, sin pasar al día siguiente.
export function LogHoursForm({ requestId }: { requestId: string }) {
  const [mode, setMode] = useState<"range" | "duration">("range");
  const [unit, setUnit] = useState<"min" | "h">("min");
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState("");

  const startMinutes = start ? Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) : null;
  const maxMinutes = LAST_MINUTE_OF_DAY - (startMinutes ?? 0);
  const minutes = durationToMinutes(duration, unit);
  const endMinutes = startMinutes !== null && minutes ? startMinutes + minutes : null;

  return (
    <form
      action={async (fd) => {
        await logHours(fd);
        setStart("");
        setDuration("");
      }}
      className="mt-3 space-y-2"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <input name="date" type="date" className={inputCls} required aria-label="Fecha" />
      <div role="radiogroup" aria-label="Cómo indicar el término" className="flex gap-1 rounded-lg border border-[#e6e8eb] p-1">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`flex-1 cursor-pointer rounded-md py-1 text-center text-xs font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#0bdbcf] ${
              mode === m.value ? "bg-[#081826] text-white" : "text-[#6b7280] hover:bg-[#f3f4f6]"
            }`}
          >
            <input
              type="radio"
              name="mode"
              className="sr-only"
              checked={mode === m.value}
              onChange={() => setMode(m.value)}
            />
            {m.label}
          </label>
        ))}
      </div>
      {mode === "range" ? (
        <div className="flex items-center gap-2">
          <input
            name="start"
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={inputCls}
            required
            aria-label="Desde"
          />
          <span className="text-xs text-[#6b7280]">a</span>
          <input name="end" type="time" className={inputCls} required aria-label="Hasta" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-[#6b7280]">Desde</span>
            <input
              name="start"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={inputCls}
              required
              aria-label="Desde"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              name="duration"
              type="number"
              required
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className={`${fieldCls} w-0 min-w-0 flex-1`}
              aria-label={unit === "min" ? "Minutos" : "Horas"}
              placeholder={unit === "min" ? "Ej: 16" : "Ej: 1,5"}
              step={unit === "min" ? 1 : "any"}
              min={unit === "min" ? 1 : 1 / 60}
              max={unit === "min" ? maxMinutes : maxMinutes / 60}
            />
            <select
              name="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as "min" | "h")}
              aria-label="Unidad"
              className={`${fieldCls} shrink-0`}
            >
              <option value="min">minutos</option>
              <option value="h">horas</option>
            </select>
          </div>
          {endMinutes !== null && (
            <p aria-live="polite" className={`text-xs ${endMinutes > LAST_MINUTE_OF_DAY ? "text-[#d21f3c]" : "text-[#6b7280]"}`}>
              {endMinutes > LAST_MINUTE_OF_DAY
                ? "El bloque no puede pasar al día siguiente."
                : `Bloque: ${start} a ${clock(endMinutes)}`}
            </p>
          )}
        </>
      )}
      <input name="note" placeholder="Detalle (opcional)" className={inputCls} />
      <SubmitButton
        pendingLabel="Cargando…"
        className="w-full rounded-lg border border-[#e6e8eb] py-2 text-sm hover:bg-[#f3f4f6]"
      >
        Cargar horas
      </SubmitButton>
    </form>
  );
}
