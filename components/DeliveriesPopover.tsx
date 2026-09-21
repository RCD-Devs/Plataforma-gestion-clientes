"use client";

import Link from "next/link";
import { Popover } from "./Popover";

export type Delivery = {
  id: string;
  key: string;
  title: string;
  client: string;
  tone: "late" | "today" | "soon";
  text: string;
};

const GROUPS: { tone: Delivery["tone"]; label: string; dot: string; text: string }[] = [
  { tone: "late", label: "Vencidas", dot: "#d21f3c", text: "#a01830" },
  { tone: "today", label: "Vencen hoy", dot: "#fb693b", text: "#9a4a1e" },
  { tone: "soon", label: "Próximos días", dot: "#fda565", text: "#9a5a25" },
];

// Recordatorios de entrega en el header: un contador que se pone rojo si hay
// vencidas y un panel agrupado por urgencia, en vez de una franja fija.
export function DeliveriesPopover({ items }: { items: Delivery[] }) {
  const late = items.filter((i) => i.tone === "late").length;
  const today = items.filter((i) => i.tone === "today").length;
  const cls =
    late > 0
      ? "border-[#f7c3c9] bg-[#fdeef0] text-[#a01830]"
      : today > 0
        ? "border-[#fb693b] bg-[#feede6] text-[#9a4a1e]"
        : "border-[#e4e8ec]";

  return (
    <Popover
      ariaLabel={items.length ? `Entregas, ${items.length} por atender` : "Entregas"}
      triggerClassName={cls}
      trigger={
        <>
          <span aria-hidden>⏰</span>
          <span className="hidden text-xs font-semibold sm:inline">Entregas</span>
          {items.length > 0 && (
            <span className="rounded-full bg-white/70 px-1.5 text-xs font-bold">{items.length}</span>
          )}
        </>
      }
    >
      <div className="border-b border-[#e4e8ec] px-4 py-2.5">
        <h2 className="text-sm font-semibold">Recordatorios de entrega</h2>
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {items.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[#7f7f7f]">Sin entregas próximas. 👌</div>
        )}
        {GROUPS.map((g) => {
          const rows = items.filter((i) => i.tone === g.tone);
          if (rows.length === 0) return null;
          return (
            <section key={g.tone} className="border-b border-[#f1f3f4] last:border-0">
              <h3 className="flex items-center gap-1.5 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#5d6b77]">
                <span className="h-2 w-2 rounded-full" style={{ background: g.dot }} />
                {g.label} · {rows.length}
              </h3>
              <ul className="py-1">
                {rows.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/solicitudes/${r.key}`}
                      className="flex items-start justify-between gap-3 px-4 py-2 hover:bg-[#f8fafb]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{r.title}</span>
                        <span className="text-[11px] text-[#7f7f7f]">
                          {r.key} · {r.client}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold" style={{ color: g.text }}>
                        {r.text}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Popover>
  );
}
