"use client";

import { useRef, useState, useTransition } from "react";
import { handoffRequest } from "@/app/actions";
import { ROLE_MAP } from "@/lib/constants";
import type { StatusInfo } from "@/lib/statuses";

// Traspaso de tarea a otro perfil (etapas: diseño → desarrollo → …).
// "Finalizada" no es opción aquí: la tarea se finaliza cuando el último
// perfil la completa, y recién ahí se le avisa al cliente.
export function HandoffPanel({
  requestId,
  teammates,
  statuses,
}: {
  requestId: string;
  teammates: { id: string; name: string; role: string }[];
  statuses: StatusInfo[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="whitespace-nowrap rounded-md border border-[#e4e8ec] px-2.5 py-1.5 text-xs font-semibold text-[#5d6b77] hover:border-[#0bdbcf] hover:text-[#065f5a]"
      >
        ⇄ Enviar
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-[#e4e8ec] bg-white p-3 shadow-lg">
          <div className="mb-2 text-xs font-semibold">
            Enviar tarea a otro perfil
          </div>
          <form
            ref={formRef}
            action={(fd) => {
              if (pending) return;
              startTransition(async () => {
                await handoffRequest(fd);
                setOpen(false);
                formRef.current?.reset();
              });
            }}
            className="space-y-2"
          >
            <input type="hidden" name="requestId" value={requestId} />
            <select
              name="toUserId"
              required
              defaultValue=""
              className="w-full rounded-md border border-[#e4e8ec] px-2 py-1.5 text-xs outline-none focus:border-[#0bdbcf]"
            >
              <option value="" disabled>
                Elegir colaborador…
              </option>
              {teammates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {ROLE_MAP[m.role]?.label ?? m.role}
                </option>
              ))}
            </select>
            <select
              name="newStatus"
              defaultValue="KEEP"
              className="w-full rounded-md border border-[#e4e8ec] px-2 py-1.5 text-xs outline-none focus:border-[#0bdbcf]"
            >
              <option value="KEEP">Mantener estado actual</option>
              {statuses.filter((s) => !s.isFinal).map((s) => (
                <option key={s.code} value={s.code}>
                  Pasar a: {s.label}
                </option>
              ))}
            </select>
            <input
              name="note"
              placeholder="Nota (ej: diseño listo, va a desarrollo)"
              className="w-full rounded-md border border-[#e4e8ec] px-2 py-1.5 text-xs outline-none focus:border-[#0bdbcf]"
            />
            <div className="flex gap-2">
              <button
                disabled={pending}
                className="flex-1 rounded-md bg-[#0bdbcf] py-1.5 text-xs font-semibold text-[#081826] hover:bg-[#09c4ba] disabled:opacity-50"
              >
                {pending ? "Enviando…" : "Enviar tarea"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-[#e4e8ec] px-2 py-1.5 text-xs text-[#5d6b77]"
              >
                Cancelar
              </button>
            </div>
            <p className="text-[10px] leading-snug text-[#7f7f7f]">
              El colaborador recibirá una notificación. El cliente no verá
              "Finalizada" hasta que la última etapa termine.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
