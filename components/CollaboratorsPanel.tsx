"use client";

import { useTransition } from "react";
import { addCollaborator, removeCollaborator } from "@/app/actions";
import { Avatar } from "@/components/ui";

export function CollaboratorsPanel({
  requestId,
  collaborators,
  users,
}: {
  requestId: string;
  collaborators: { id: string; name: string; color: string | null }[];
  users: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const availableUsers = users.filter(
    (u) => !collaborators.some((c) => c.id === u.id),
  );

  return (
    <div className="space-y-1.5">
      {collaborators.map((c) => (
        <div key={c.id} className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5">
            <Avatar name={c.name} color={c.color} size={18} />
            {c.name}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => removeCollaborator(requestId, c.id))}
            className="text-[#6b7280] hover:text-[#d21f3c] disabled:opacity-50"
          >
            Quitar
          </button>
        </div>
      ))}
      {collaborators.length === 0 && (
        <div className="text-xs text-[#6b7280]">Sin colaboradores.</div>
      )}
      {availableUsers.length > 0 && (
        <select
          disabled={pending}
          value=""
          onChange={(e) => {
            const userId = e.target.value;
            if (userId) start(() => addCollaborator(requestId, userId));
          }}
          className="mt-1 h-8 w-full rounded-md border border-[#e6e8eb] bg-white px-2 text-xs outline-none focus:border-[#0bdbcf]"
        >
          <option value="">+ Agregar colaborador…</option>
          {availableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
