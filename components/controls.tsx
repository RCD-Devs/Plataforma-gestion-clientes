"use client";

import { useTransition } from "react";
import { STATUSES, PRIORITIES } from "@/lib/constants";
import {
  changeStatus,
  assignRequest,
  updatePriority,
  setClientPriority,
} from "@/app/actions";

const selectCls =
  "h-8 rounded-md border border-[#e4e8ec] bg-white px-2 text-sm outline-none focus:border-[#0bdbcf] disabled:opacity-50";

export function StatusSelect({
  requestId,
  value,
}: {
  requestId: string;
  value: string;
}) {
  const [pending, start] = useTransition();
  return (
    <select
      className={selectCls}
      defaultValue={value}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        start(() => changeStatus(requestId, v));
      }}
    >
      {STATUSES.map((s) => (
        <option key={s.key} value={s.key}>
          {s.label}
        </option>
      ))}
    </select>
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
  const [pending, start] = useTransition();
  return (
    <select
      className={selectCls}
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        start(() => assignRequest(requestId, v));
      }}
    >
      <option value="">Sin asignar</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}

export function PrioritySelect({
  requestId,
  value,
}: {
  requestId: string;
  value: string;
}) {
  const [pending, start] = useTransition();
  return (
    <select
      className={selectCls}
      defaultValue={value}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        start(() => updatePriority(requestId, v));
      }}
    >
      {PRIORITIES.map((p) => (
        <option key={p.key} value={p.key}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

export function ClientPriorityStars({
  requestId,
  value,
}: {
  requestId: string;
  value: number | null;
}) {
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={pending}
          onClick={() => start(() => setClientPriority(requestId, n))}
          className="text-lg leading-none transition-transform hover:scale-110 disabled:opacity-50"
          style={{ color: (value ?? 0) >= n ? "#fb693b" : "#d1d5db" }}
          aria-label={`Prioridad ${n} de 5`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
