"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { markTeamAlertsRead } from "@/app/actions";
import { Popover } from "./Popover";
import { NUDGE_LABELS, type NudgeItem } from "@/lib/nudges";

export type BellItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  when: string;
};

// Campanita: notificaciones y pendientes ("dale una pasada a esto") ocultos
// hasta abrir el panel. Los pendientes se actualizan en vivo (SSE) como antes.
export function NotificationBell({
  items,
  unread,
  initialNudges,
}: {
  items: BellItem[];
  unread: number;
  initialNudges: NudgeItem[];
}) {
  const [nudges, setNudges] = useState<NudgeItem[]>(initialNudges);

  useEffect(() => {
    const source = new EventSource("/api/nudges/stream");
    source.onmessage = (event) => {
      try {
        setNudges(JSON.parse(event.data));
      } catch {
        // Mensaje corrupto: el próximo tick trae uno bueno.
      }
    };
    return () => source.close();
  }, []);

  const pending = nudges.filter((n) => NUDGE_LABELS[n.kind]);
  const badge = unread + pending.length;

  return (
    <Popover
      ariaLabel={badge > 0 ? `Notificaciones, ${badge} pendientes` : "Notificaciones"}
      trigger={
        <>
          <span aria-hidden>🔔</span>
          {badge > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#fb693b] px-1 text-[10px] font-bold text-white">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </>
      }
    >
      <div className="max-h-[70vh] overflow-y-auto">
        {pending.length > 0 && (
          <section className="border-b border-[#e4e8ec] bg-[#fdf1e3]/60 px-4 py-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#9a5a25]">
              Pendientes
            </h2>
            <div className="space-y-3">
              {pending.map((item) => {
                const label = NUDGE_LABELS[item.kind]!;
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
                          className="rounded-md border border-[#fda565] bg-white px-2 py-0.5 text-xs text-[#5d3a16] hover:bg-[#fdf1e3]"
                        >
                          {t.key}
                        </Link>
                      ))}
                      {item.taskCount > item.tasks.length && (
                        <span className="px-1 py-0.5 text-xs text-[#9a5a25]">
                          +{item.taskCount - item.tasks.length} más
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="flex items-center justify-between border-b border-[#e4e8ec] px-4 py-2.5">
          <h2 className="text-sm font-semibold">Notificaciones</h2>
          {unread > 0 && (
            <form action={markTeamAlertsRead}>
              <button className="text-xs text-[#08a89f] hover:underline">Marcar leídas</button>
            </form>
          )}
        </div>
        <div className="divide-y divide-[#f1f3f4]">
          {items.map((n) => (
            <div key={n.id} className={`px-4 py-3 ${n.read ? "" : "bg-[#e0fbf9]/60"}`}>
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
    </Popover>
  );
}
