"use client";

import { useState } from "react";

// Empresa + sitio/proyecto (este último solo aparece si la empresa elegida
// tiene proyectos activos). Para el formulario público.
export function ClientProjectFields({
  clients,
  inputCls,
}: {
  clients: { id: string; name: string; projects: { id: string; name: string }[] }[];
  inputCls: string;
}) {
  const [clientId, setClientId] = useState("");
  const projects = clients.find((c) => c.id === clientId)?.projects ?? [];
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
    </>
  );
}
