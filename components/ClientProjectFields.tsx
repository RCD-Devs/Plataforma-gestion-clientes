"use client";

import { useState } from "react";

// Empresa + sitio/proyecto (este último solo aparece si la empresa elegida
// tiene proyectos activos). Para el formulario público. Si el cliente trae
// `assignees` (equipo interno con permiso de asignar), agrega el selector
// de responsable con los perfiles asociados a ese cliente.
export function ClientProjectFields({
  clients,
  inputCls,
}: {
  clients: {
    id: string;
    name: string;
    projects: { id: string; name: string }[];
    assignees?: { id: string; name: string }[];
  }[];
  inputCls: string;
}) {
  const [clientId, setClientId] = useState("");
  const client = clients.find((c) => c.id === clientId);
  const projects = client?.projects ?? [];
  const assignees = client?.assignees;
  return (
    <>
      <label className="block">
        <div className="mb-1 text-sm font-semibold">Empresa / Cliente</div>
        <select
          name="clientId"
          required
          className={inputCls}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="" disabled>
            Selecciona…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {projects.length > 0 && (
        <label className="block">
          <div className="mb-1 text-sm font-semibold">Sitio / proyecto</div>
          <select key={clientId} name="projectId" className={inputCls} defaultValue="">
            <option value="">General (no aplica a un sitio)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {client && assignees && (
        <label className="block">
          <div className="mb-1 text-sm font-semibold">Responsable</div>
          <div className="mb-1 text-xs text-[#6b7280]">
            {assignees.length
              ? "Opcional · perfiles asociados a este cliente"
              : "Este cliente no tiene perfiles asociados · quedará sin asignar"}
          </div>
          <select key={clientId} name="assigneeId" className={inputCls} defaultValue="">
            <option value="">Sin asignar</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
