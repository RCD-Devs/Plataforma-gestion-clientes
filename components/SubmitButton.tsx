"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Evita el doble-submit en formularios simples (server component + <form
// action={fn}>, sin useTransition): sin esto, un segundo click mientras la
// primera request todavía está en vuelo dispara dos veces la Server
// Action — en /cambiar-clave eso rota la contraseña una vez y la segunda
// request falla con "contraseña actual incorrecta" porque ya cambió,
// dejando al usuario convencido de que no funcionó.
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: ReactNode;
  pendingLabel?: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? (pendingLabel ?? "Guardando…") : children}
    </button>
  );
}
