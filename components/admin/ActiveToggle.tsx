"use client";

import { useTransition } from "react";

export function ActiveToggle({
  id,
  isActive,
  action,
  confirmDeactivate,
}: {
  id: string;
  isActive: boolean;
  action: (id: string, next: boolean) => Promise<void>;
  confirmDeactivate?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (isActive && confirmDeactivate && !window.confirm(confirmDeactivate)) return;
        start(() => action(id, !isActive));
      }}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${
        isActive
          ? "bg-[#e6f7f0] text-[#0e9f6e] hover:bg-[#d6f0e6]"
          : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e6e8eb]"
      }`}
    >
      {pending ? "…" : isActive ? "Activo" : "Inactivo"}
    </button>
  );
}
