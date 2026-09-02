"use client";

import { useTransition } from "react";
import { deleteAttachment } from "@/app/actions";

export function AttachmentDeleteButton({ attachmentId }: { attachmentId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm("¿Eliminar este adjunto? No se puede deshacer.")) return;
        startTransition(() => deleteAttachment(attachmentId));
      }}
      title="Eliminar adjunto"
      className="shrink-0 rounded px-1.5 text-xs text-[#9ca3af] hover:bg-[#feede6] hover:text-[#d21f3c] disabled:opacity-50"
    >
      {pending ? "…" : "✕"}
    </button>
  );
}
