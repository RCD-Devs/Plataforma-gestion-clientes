"use client";

import { useTransition } from "react";
import { deleteClient } from "@/app/actions";

export function ClientDeleteButton({ id, name, disabled }: { id: string; name: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      title={disabled ? "Primero desactiva el cliente; recién ahí se puede eliminar" : undefined}
      onClick={() => {
        const typed = prompt(
          `Esto borra DEFINITIVAMENTE a "${name}" con todas sus solicitudes, horas cargadas, comentarios, adjuntos y proyectos. No se puede deshacer.\n\nEscribe el nombre del cliente para confirmar:`,
        );
        if (typed?.trim() !== name.trim()) return;
        start(() => deleteClient(id));
      }}
      className="rounded-md border border-[#d21f3c] px-3 py-1.5 text-xs font-semibold text-[#d21f3c] hover:bg-[#fdecef] disabled:cursor-not-allowed disabled:border-[#d9dde1] disabled:text-[#d9dde1] disabled:hover:bg-transparent"
    >
      {pending ? "Eliminando…" : "Eliminar cliente"}
    </button>
  );
}
