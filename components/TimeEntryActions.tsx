"use client";

import { useState, useTransition } from "react";
import { updateTimeEntry, deleteTimeEntry } from "@/app/actions";
import { toDateInput } from "@/lib/dates";

const inputCls =
  "rounded-lg border border-[#e6e8eb] px-2 py-1 text-xs outline-none focus:border-[#0bdbcf]";

// Editar/eliminar una carga de horas ya registrada — solo para quien
// tenga el permiso hours.manage (matriz de roles), sin importar quién la
// cargó originalmente: el caso típico es corregir el error de otra
// persona, no el propio.
export function TimeEntryActions({
  entryId,
  hours,
  date,
  note,
}: {
  entryId: string;
  hours: number;
  date: Date;
  note: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      // w-full: vive en la columna angosta del detalle; con flex-wrap el
      // campo de detalle quedaba en 0 px y solo se veían hora y fecha.
      <form
        className="mt-1 w-full space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            await updateTimeEntry(entryId, fd);
            setEditing(false);
          });
        }}
      >
        <div className="flex items-center gap-1.5">
          <input name="hours" type="number" step="any" min="0.01" defaultValue={hours} required aria-label="Horas" className={`${inputCls} w-16`} />
          <input name="date" type="date" defaultValue={toDateInput(date)} aria-label="Fecha" className={`${inputCls} min-w-0 flex-1`} />
        </div>
        <textarea
          name="note"
          defaultValue={note ?? ""}
          placeholder="Detalle de lo que se hizo"
          aria-label="Detalle"
          rows={3}
          className={`${inputCls} block w-full resize-y`}
        />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-[#6b7280] hover:underline">
            Cancelar
          </button>
          <button type="submit" disabled={pending} className="text-xs font-semibold text-[#08a89f] hover:underline disabled:opacity-50">
            Guardar
          </button>
        </div>
      </form>
    );
  }

  return (
    <span className="flex items-center gap-2 text-[11px] text-[#9ca3af]">
      <button type="button" onClick={() => setEditing(true)} className="hover:text-[#374151] hover:underline">
        Editar
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("¿Eliminar esta carga de horas?")) return;
          startTransition(() => deleteTimeEntry(entryId));
        }}
        className="hover:text-[#d21f3c] hover:underline disabled:opacity-50"
      >
        Eliminar
      </button>
    </span>
  );
}
