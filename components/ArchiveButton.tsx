"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveRequest, unarchiveRequest, deleteRequest } from "@/app/actions";

export function ArchiveButton({
  requestId,
  archived,
}: {
  requestId: string;
  archived: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!archived && !confirm("¿Archivar esta solicitud? Deja de aparecer en tablero, solicitudes y mi espacio.")) {
          return;
        }
        startTransition(() =>
          archived ? unarchiveRequest(requestId) : archiveRequest(requestId),
        );
      }}
      className="text-xs font-semibold text-[#6b7280] hover:text-[#374151] hover:underline disabled:opacity-50"
    >
      {pending ? "…" : archived ? "Restaurar" : "Archivar"}
    </button>
  );
}

// Papelera: para lo creado por error. Si el servidor lo rechaza (tiene
// horas cargadas) se muestra el motivo en vez de fallar en silencio.
export function DeleteRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-[#d21f3c]">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("¿Eliminar esta solicitud? Se va a la papelera junto con sus subtareas y deja de contar en reportes. Un Admin puede restaurarla.")) {
            return;
          }
          setError(null);
          startTransition(async () => {
            const res = await deleteRequest(requestId);
            if (res.ok && res.redirectTo) router.push(res.redirectTo);
            else setError(res.error ?? "No se pudo eliminar.");
          });
        }}
        className="text-xs font-semibold text-[#6b7280] hover:text-[#d21f3c] hover:underline disabled:opacity-50"
      >
        {pending ? "…" : "Eliminar"}
      </button>
    </span>
  );
}
