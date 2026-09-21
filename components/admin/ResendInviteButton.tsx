"use client";

import { useState, useTransition } from "react";
import { resendInvite } from "@/app/actions";

export function ResendInviteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await resendInvite(id);
            setMsg(r.ok ? "Enviada ✓" : r.error);
          })
        }
        className="text-xs font-semibold text-[#08a89f] hover:underline disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Reenviar invitación"}
      </button>
      {msg && <span className="text-xs text-[#6b7280]">{msg}</span>}
    </span>
  );
}
