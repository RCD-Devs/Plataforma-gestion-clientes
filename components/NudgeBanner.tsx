"use client";

import { useState } from "react";
import Link from "next/link";
import type { NudgeItem, NudgeKind } from "@/lib/nudges";

const LABELS: Record<NudgeKind, { icon: string; title: (n: number) => string }> = {
  MISSING_TIMES: {
    icon: "⏱️",
    title: (n) => `${n} tarea${n === 1 ? "" : "s"} sin horas cargadas`,
  },
  DUE_DATES: {
    icon: "📅",
    title: (n) => `${n} tarea${n === 1 ? "" : "s"} vencida${n === 1 ? "" : "s"} o por vencer`,
  },
  STALE_STATUS: {
    icon: "🐢",
    title: (n) => `${n} tarea${n === 1 ? "" : "s"} sin movimiento hace 3+ días`,
  },
  MISSING_COMMENTS: {
    icon: "💬",
    title: (n) => `${n} tarea${n === 1 ? "" : "s"} sin un comentario tuyo`,
  },
};

export function NudgeBanner({ items }: { items: NudgeItem[] }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || items.length === 0) return null;

  return (
    <div className="mx-6 mt-4 rounded-xl border border-[#fda565] bg-[#fdf1e3] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#9a5a25]">
          👋 Antes de seguir, dale una pasada a esto
        </h2>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-[#9a5a25] hover:underline"
        >
          Cerrar
        </button>
      </div>
      <div className="space-y-3">
        {items.map((item) => {
          const label = LABELS[item.kind];
          return (
            <div key={item.kind}>
              <div className="mb-1 text-xs font-semibold text-[#7a4419]">
                {label.icon} {label.title(item.taskCount)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {item.tasks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/solicitudes/${t.key}`}
                    className="rounded-md border border-[#fda565] bg-white px-2 py-1 text-xs text-[#5d3a16] hover:bg-[#fdf1e3]"
                  >
                    {t.key}
                  </Link>
                ))}
                {item.taskCount > item.tasks.length && (
                  <span className="px-1 py-1 text-xs text-[#9a5a25]">
                    +{item.taskCount - item.tasks.length} más
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
