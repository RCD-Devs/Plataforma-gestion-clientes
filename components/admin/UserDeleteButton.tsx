"use client";

import { useTransition } from "react";
import { deleteUser } from "@/app/actions";

export function UserDeleteButton({ id, disabled }: { id: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      title={
        disabled
          ? "Solo se puede eliminar un usuario sin solicitudes asignadas, horas cargadas ni clientes a cargo — desactívalo en vez de borrarlo"
          : undefined
      }
      onClick={() => {
        if (!confirm("¿Eliminar este usuario? No se puede deshacer.")) return;
        start(() => deleteUser(id));
      }}
      className="text-xs font-semibold text-[#d21f3c] hover:underline disabled:cursor-not-allowed disabled:text-[#d9dde1] disabled:no-underline"
    >
      {pending ? "…" : "Eliminar"}
    </button>
  );
}
