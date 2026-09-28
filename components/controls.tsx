"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PRIORITIES } from "@/lib/constants";
import type { StatusInfo } from "@/lib/statuses";
import {
  changeStatus,
  assignRequest,
  updatePriority,
  setClientPriority,
  changeRequestClient,
} from "@/app/actions";

const selectCls =
  "h-8 rounded-md border border-[#e4e8ec] bg-white px-2 text-sm outline-none focus:border-[#0bdbcf] disabled:opacity-50";

// Rec. #90 — estos controles son la forma más usada de editar una
// solicitud (tablero, mi-espacio, ficha). Si la acción del servidor falla
// en silencio (permiso perdido, la solicitud cambió de dueño mientras
// tanto), un <select> no controlado se queda mostrando el valor nuevo
// aunque la base no cambió — confuso y sin aviso. Con value+onChange acá
// se revierte al valor real y se marca en rojo un momento.
function useRevertOnFailure<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  function run(optimistic: T, action: () => Promise<{ ok: boolean }>) {
    const previous = value;
    setValue(optimistic);
    setFailed(false);
    start(async () => {
      const res = await action();
      if (!res.ok) {
        setValue(previous);
        setFailed(true);
        setTimeout(() => setFailed(false), 2500);
      }
    });
  }
  return { value, failed, pending, run };
}

export function StatusSelect({
  requestId,
  value,
  statuses,
}: {
  requestId: string;
  value: string;
  statuses: StatusInfo[];
}) {
  const s = useRevertOnFailure(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        className={`${selectCls} ${s.failed ? "border-[#d21f3c]" : ""}`}
        value={s.value}
        disabled={s.pending}
        onChange={(e) => {
          const v = e.target.value;
          s.run(v, () => changeStatus(requestId, v));
        }}
      >
        {statuses.map((st) => (
          <option key={st.code} value={st.code}>
            {st.label}
          </option>
        ))}
      </select>
      {s.failed && (
        <span className="text-xs text-[#d21f3c]" title="No se pudo guardar el cambio">
          ⚠
        </span>
      )}
    </span>
  );
}

export function AssigneeSelect({
  requestId,
  value,
  users,
}: {
  requestId: string;
  value: string | null;
  users: { id: string; name: string }[];
}) {
  const s = useRevertOnFailure(value ?? "");
  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        className={`${selectCls} ${s.failed ? "border-[#d21f3c]" : ""}`}
        value={s.value}
        disabled={s.pending}
        onChange={(e) => {
          const v = e.target.value;
          s.run(v, () => assignRequest(requestId, v));
        }}
      >
        <option value="">Sin asignar</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      {s.failed && (
        <span className="text-xs text-[#d21f3c]" title="No se pudo guardar el cambio">
          ⚠
        </span>
      )}
    </span>
  );
}

export function PrioritySelect({
  requestId,
  value,
}: {
  requestId: string;
  value: string;
}) {
  const s = useRevertOnFailure(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        className={`${selectCls} ${s.failed ? "border-[#d21f3c]" : ""}`}
        value={s.value}
        disabled={s.pending}
        onChange={(e) => {
          const v = e.target.value;
          s.run(v, () => updatePriority(requestId, v));
        }}
      >
        {PRIORITIES.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
      {s.failed && (
        <span className="text-xs text-[#d21f3c]" title="No se pudo guardar el cambio">
          ⚠
        </span>
      )}
    </span>
  );
}

// Cambiar de cliente cambia el folio (y la URL), así que pide confirmación
// y al terminar navega a la ficha con el folio nuevo.
export function ClientSelect({
  requestId,
  value,
  clients,
}: {
  requestId: string;
  value: string;
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const s = useRevertOnFailure(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        className={`${selectCls} max-w-44 ${s.failed ? "border-[#d21f3c]" : ""}`}
        value={s.value}
        disabled={s.pending}
        onChange={(e) => {
          const v = e.target.value;
          const name = clients.find((c) => c.id === v)?.name;
          if (!confirm(`¿Mover la solicitud a ${name}? Tomará un folio nuevo de ese cliente, se quitará el proyecto y sus horas pasarán a su bolsa.`)) return;
          s.run(v, async () => {
            const res = await changeRequestClient(requestId, v);
            if (res.ok && res.key) router.replace(`/solicitudes/${res.key}`);
            return res;
          });
        }}
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {s.failed && (
        <span className="text-xs text-[#d21f3c]" title="No se pudo guardar el cambio">
          ⚠
        </span>
      )}
    </span>
  );
}

export function ClientPriorityStars({
  requestId,
  value,
}: {
  requestId: string;
  value: number | null;
}) {
  const s = useRevertOnFailure(value ?? 0);
  return (
    <span className="inline-flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={s.pending}
          onClick={() => s.run(n, () => setClientPriority(requestId, n))}
          className="text-lg leading-none transition-transform hover:scale-110 disabled:opacity-50"
          style={{ color: s.value >= n ? "#fb693b" : "#d1d5db" }}
          aria-label={`Prioridad ${n} de 5`}
        >
          ★
        </button>
      ))}
      {s.failed && (
        <span className="text-xs text-[#d21f3c]" title="No se pudo guardar el cambio">
          ⚠
        </span>
      )}
    </span>
  );
}
