"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { StatusInfo } from "@/lib/statuses";
import { changeStatus } from "@/app/actions";
import { Avatar, PriorityTag, ClientTag } from "@/components/ui";
import { hoursLabel } from "@/lib/format";

export type BoardCard = {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  hours: number;
  clientLabel: string;
  assignee: { name: string; color: string | null } | null;
  // false si el usuario actual no puede actuar sobre esta solicitud
  // (canActOnRequest) — la tarjeta se ve pero no se puede arrastrar. El
  // servidor vuelve a validar en changeStatus de todos modos.
  canDrag: boolean;
};

// Nuevo #20 — drag-and-drop nativo del navegador (HTML5 Drag and Drop API):
// no hay reordenamiento dentro de una columna ni soporte táctil que pedir,
// así que no se justifica sumar una librería como dnd-kit. El reordenar
// columnas ya existe (sortOrder editable en /admin/estados).
// ponytail: sin soporte táctil real (tablet/mobile) — el <select> de
// estado en la ficha de la solicitud sigue siendo el camino ahí.
export function Board({
  statuses,
  cards,
}: {
  statuses: StatusInfo[];
  cards: BoardCard[];
}) {
  const [items, setItems] = useState(cards);
  const [dragOverCode, setDragOverCode] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function moveCard(id: string, toStatus: string) {
    const card = items.find((c) => c.id === id);
    if (!card || card.status === toStatus) return;
    const fromStatus = card.status;
    setItems((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: toStatus } : c)),
    );
    startTransition(async () => {
      const res = await changeStatus(id, toStatus);
      if (!res.ok) {
        setItems((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: fromStatus } : c)),
        );
      }
    });
  }

  return (
    <div className="thin-scroll flex flex-1 gap-4 overflow-x-auto p-6">
      {statuses.map((s) => {
        const colItems = items.filter((c) => c.status === s.code);
        return (
          <div
            key={s.code}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCode(s.code);
            }}
            onDragLeave={() =>
              setDragOverCode((c) => (c === s.code ? null : c))
            }
            onDrop={(e) => {
              e.preventDefault();
              setDragOverCode(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) moveCard(id, s.code);
            }}
            className={`flex w-72 shrink-0 flex-col rounded-xl transition-colors ${
              dragOverCode === s.code ? "bg-[#e0fbf9]" : ""
            }`}
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                style={{ background: s.color }}
                className="h-2.5 w-2.5 rounded-full"
              />
              <span className="text-sm font-semibold">{s.label}</span>
              <span className="rounded bg-[#f3f4f6] px-1.5 text-xs text-[#6b7280]">
                {colItems.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {colItems.map((c) => (
                <div
                  key={c.id}
                  draggable={c.canDrag}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", c.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className={`rounded-xl border border-[#e6e8eb] bg-white p-3 transition hover:border-[#0bdbcf] hover:shadow-sm ${
                    c.canDrag ? "cursor-grab active:cursor-grabbing" : ""
                  }`}
                >
                  <Link href={`/solicitudes/${c.key}`} className="block">
                    <div className="mb-2 flex items-center gap-1.5">
                      <ClientTag name={c.clientLabel} />
                      <PriorityTag priority={c.priority} />
                    </div>
                    <div className="mb-2 text-sm leading-snug">{c.title}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#6b7280]">{c.key}</span>
                      <div className="flex items-center gap-2">
                        {c.hours > 0 && (
                          <span className="text-xs text-[#6b7280]">
                            {hoursLabel(c.hours)}
                          </span>
                        )}
                        {c.assignee ? (
                          <Avatar
                            name={c.assignee.name}
                            color={c.assignee.color}
                            size={22}
                          />
                        ) : (
                          <span className="h-[22px] w-[22px] rounded-full border border-dashed border-[#d1d5db]" />
                        )}
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
              {colItems.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#e6e8eb] p-3 text-center text-xs text-[#6b7280]">
                  Sin tarjetas
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
