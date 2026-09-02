"use client";

import { useState, useTransition } from "react";
import { editComment, deleteComment } from "@/app/actions";

export function CommentActions({
  commentId,
  body,
}: {
  commentId: string;
  body: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        className="mt-1 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            await editComment(commentId, draft);
            setEditing(false);
          });
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-[#e6e8eb] px-3 py-1.5 text-sm outline-none focus:border-[#0bdbcf]"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="shrink-0 text-xs font-semibold text-[#08a89f] hover:underline disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(body);
            setEditing(false);
          }}
          className="shrink-0 text-xs text-[#6b7280] hover:underline"
        >
          Cancelar
        </button>
      </form>
    );
  }

  return (
    <div className="mt-1 flex gap-3 text-[11px] text-[#9ca3af]">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="hover:text-[#374151] hover:underline"
      >
        Editar
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("¿Eliminar este comentario?")) return;
          startTransition(() => deleteComment(commentId));
        }}
        className="hover:text-[#d21f3c] hover:underline disabled:opacity-50"
      >
        Eliminar
      </button>
    </div>
  );
}
