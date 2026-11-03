"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { FollowUpForm } from "@/components/FollowUpForm";

// Lápiz que abre el seguimiento en un <dialog> nativo (Esc y foco
// atrapado los da el navegador). El formulario se monta solo al abrir,
// así cada apertura parte de los datos actuales.
export function EditFollowUpButton(props: Omit<ComponentProps<typeof FollowUpForm>, "mode" | "onDone">) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Editar seguimiento"
        title="Editar"
        className="grid h-7 w-7 place-items-center rounded-md text-[#5d6b77] hover:bg-[#eef1f4] hover:text-[#081826]"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
          <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <dialog
          ref={ref}
          onClose={() => setOpen(false)}
          onClick={(e) => e.target === e.currentTarget && ref.current?.close()} // clic en el fondo
          className="m-auto w-[min(46rem,calc(100vw-2rem))] rounded-2xl p-0 shadow-xl backdrop:bg-[#081826]/40"
        >
          <div className="flex items-center justify-between border-b border-[#f1f3f4] px-4 py-3">
            <h2 className="font-brand text-sm font-semibold">Editar seguimiento</h2>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Cerrar" className="text-[#7f7f7f] hover:text-[#081826]">
              ✕
            </button>
          </div>
          <FollowUpForm {...props} mode="edit" onDone={() => ref.current?.close()} />
        </dialog>
      )}
    </>
  );
}
