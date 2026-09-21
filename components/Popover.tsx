"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Botón + panel flotante que se cierra al hacer clic fuera o con Esc.
// Base común de la campanita y del panel de entregas del header.
export function Popover({
  trigger,
  ariaLabel,
  triggerClassName = "",
  children,
}: {
  trigger: ReactNode;
  ariaLabel: string;
  triggerClassName?: string;
  children: ReactNode;
}) {
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
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm hover:bg-[#f4f6f8] ${triggerClassName || "border-[#e4e8ec]"}`}
      >
        {trigger}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#e4e8ec] bg-white shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}
