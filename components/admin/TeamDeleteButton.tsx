"use client";

import { useTransition } from "react";
import { deleteTeam } from "@/app/actions";

export function TeamDeleteButton({ id, disabled }: { id: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      title={disabled ? "Solo se puede eliminar un equipo sin miembros ni tareas" : undefined}
      onClick={() => {
        if (!confirm("¿Eliminar este equipo?")) return;
        start(() => deleteTeam(id));
      }}
      className="text-xs font-semibold text-[#d21f3c] hover:underline disabled:cursor-not-allowed disabled:text-[#d9dde1] disabled:no-underline"
    >
      {pending ? "…" : "Eliminar"}
    </button>
  );
}
