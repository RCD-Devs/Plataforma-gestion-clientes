"use client";

import { useState, useTransition } from "react";
import { updateRequestDetails } from "@/app/actions";
import { REQUEST_TYPES } from "@/lib/constants";
import { toDateInput } from "@/lib/dates";

const inputCls =
  "w-full rounded-lg border border-[#e6e8eb] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export function RequestEditPanel({
  requestId,
  title,
  description,
  type,
  dueDate,
}: {
  requestId: string;
  title: string;
  description: string;
  type: string;
  dueDate: Date | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-[#08a89f] hover:underline"
      >
        Editar detalles
      </button>
    );
  }

  return (
    <form
      action={(fd) => {
        if (pending) return;
        startTransition(async () => {
          await updateRequestDetails(requestId, fd);
          setOpen(false);
        });
      }}
      className="mt-2 space-y-2 rounded-xl border border-[#e6e8eb] bg-white p-4"
    >
      <div>
        <label className="mb-1 block text-xs font-semibold text-[#6b7280]">
          Título
        </label>
        <input name="title" defaultValue={title} required className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-[#6b7280]">
          Descripción
        </label>
        <textarea
          name="description"
          defaultValue={description}
          rows={4}
          className={`${inputCls} resize-y`}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b7280]">
            Tipo
          </label>
          <select name="type" defaultValue={type} className={inputCls}>
            {REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b7280]">
            Fecha límite
          </label>
          <input
            name="dueDate"
            type="date"
            defaultValue={dueDate ? toDateInput(dueDate) : ""}
            className={inputCls}
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          disabled={pending}
          className="rounded-lg bg-[#0bdbcf] px-4 py-1.5 text-xs font-semibold text-[#081826] hover:bg-[#09c4ba] disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="rounded-lg border border-[#e6e8eb] px-4 py-1.5 text-xs text-[#5d6b77]"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
