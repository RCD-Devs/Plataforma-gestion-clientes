"use client";

import { useTransition } from "react";
import { archiveRequest, unarchiveRequest } from "@/app/actions";

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
