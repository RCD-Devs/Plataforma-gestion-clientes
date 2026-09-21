"use client";

import { useEffect, useRef, useState } from "react";
import { markTeamAlertsRead } from "@/app/actions";

export type BellItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  when: string;
};

// Campanita con popover: las notificaciones quedan ocultas hasta que se abre.
export function NotificationBell({ items, unread }: { items: BellItem[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notificaciones, ${unread} nuevas` : "Notificaciones"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg border border-[#e4e8ec] px-2.5 py-1.5 text-base hover:bg-[#f4f6f8]"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#fb693b] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#e4e8ec] bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-[#e4e8ec] px-4 py-2.5">
            <h2 className="text-sm font-semibold">Notificaciones</h2>
            {unread > 0 && (
              <form action={markTeamAlertsRead}>
                <button className="text-xs text-[#08a89f] hover:underline">
                  Marcar leídas
                </button>
              </form>
            )}
          </div>
          <div className="max-h-96 divide-y divide-[#f1f3f4] overflow-y-auto">
            {items.map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3 ${n.read ? "" : "bg-[#e0fbf9]/60"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold">{n.title}</span>
                  <span className="shrink-0 text-[10px] text-[#7f7f7f]">{n.when}</span>
                </div>
                <p className="mt-0.5 line-clamp-3 text-xs text-[#5d6b77]">{n.body}</p>
              </div>
            ))}
            {items.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-[#7f7f7f]">
                Sin notificaciones aún.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
