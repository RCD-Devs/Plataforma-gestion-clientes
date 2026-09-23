"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PRIORITIES, ROLES } from "@/lib/constants";
import type { StatusInfo } from "@/lib/statuses";

type Opt = { id: string; name: string };

export function Filters({
  clients,
  users,
  teams,
  projects,
  statuses,
  hide = [],
}: {
  clients: Opt[];
  users: Opt[];
  teams: Opt[];
  projects: Opt[];
  statuses: StatusInfo[];
  // Filtros que no aplican a la vista (ej. "responsable" en Mi espacio).
  hide?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setParam(key: string, value: string, extra?: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    extra?.(params);
    router.push(`${pathname}?${params.toString()}`);
  }

  // Proyectos del cliente elegido: su valor es "cliente--proyecto" (ver
  // projectParam en lib/requestFilters.ts), así que basta el prefijo.
  const clientOf = (projectValue: string) => projectValue.split("--")[0];
  const cliente = sp.get("cliente");
  const visibleProjects = cliente ? projects.filter((p) => clientOf(p.id) === cliente) : projects;

  const cls =
    "h-8 rounded-md border border-[#e4e8ec] bg-white px-2 text-sm text-[#374151] outline-none focus:border-[#0bdbcf]";
  // ?vista= (tablero/lista en Mi espacio) no es un filtro: Limpiar la conserva.
  const vista = sp.get("vista");
  const hasFilters = [...sp.keys()].some((k) => k !== "vista");
  const show = (k: string) => !hide.includes(k);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        defaultValue={sp.get("q") ?? ""}
        placeholder="Buscar folio, cliente, comentario…"
        className={`${cls} w-52`}
        onKeyDown={(e) => {
          if (e.key === "Enter")
            setParam("q", (e.target as HTMLInputElement).value);
        }}
      />
      <select
        className={cls}
        value={sp.get("cliente") ?? ""}
        onChange={(e) =>
          // Cambiar de cliente suelta un proyecto que ya no es suyo.
          setParam("cliente", e.target.value, (params) => {
            const proyecto = params.get("proyecto");
            if (proyecto && e.target.value && clientOf(proyecto) !== e.target.value) params.delete("proyecto");
          })
        }
      >
        <option value="">Cliente</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {show("responsable") && (
        <select
          className={cls}
          value={sp.get("responsable") ?? ""}
          onChange={(e) => setParam("responsable", e.target.value)}
        >
          <option value="">Responsable</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}
      <select
        className={cls}
        value={sp.get("proyecto") ?? ""}
        onChange={(e) =>
          setParam("proyecto", e.target.value, (params) => {
            if (e.target.value) params.set("cliente", clientOf(e.target.value));
          })
        }
      >
        <option value="">Proyecto</option>
        {visibleProjects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {show("equipo") && (
        <select
          className={cls}
          value={sp.get("equipo") ?? ""}
          onChange={(e) => setParam("equipo", e.target.value)}
        >
          <option value="">Equipo</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {show("rol") && (
        <select
          className={cls}
          value={sp.get("rol") ?? ""}
          onChange={(e) => setParam("rol", e.target.value)}
        >
          <option value="">Rol</option>
          {ROLES.filter((r) => r.key !== "CLIENTE" && r.key !== "ADMIN").map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      )}
      <select
        className={cls}
        value={sp.get("estado") ?? ""}
        onChange={(e) => setParam("estado", e.target.value)}
      >
        <option value="">Estado</option>
        {statuses.map((s) => (
          <option key={s.code} value={s.code}>
            {s.label}
          </option>
        ))}
      </select>
      <select
        className={cls}
        value={sp.get("prioridad") ?? ""}
        onChange={(e) => setParam("prioridad", e.target.value)}
      >
        <option value="">Prioridad</option>
        {PRIORITIES.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs text-[#6b7280]">
        Desde
        <input
          type="date"
          className={cls}
          defaultValue={sp.get("desde") ?? ""}
          onChange={(e) => setParam("desde", e.target.value)}
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-[#6b7280]">
        Hasta
        <input
          type="date"
          className={cls}
          defaultValue={sp.get("hasta") ?? ""}
          onChange={(e) => setParam("hasta", e.target.value)}
        />
      </label>
      {show("archivadas") && (
        <label className="flex items-center gap-1 text-xs text-[#6b7280]">
          <input
            type="checkbox"
            checked={sp.get("archivadas") === "1"}
            onChange={(e) => setParam("archivadas", e.target.checked ? "1" : "")}
            className="h-3.5 w-3.5 accent-[#0bdbcf]"
          />
          Ver archivadas
        </label>
      )}
      <label className="flex items-center gap-1 text-xs text-[#6b7280]">
        <input
          type="checkbox"
          checked={sp.get("antiguas") === "1"}
          onChange={(e) => setParam("antiguas", e.target.checked ? "1" : "")}
          className="h-3.5 w-3.5 accent-[#0bdbcf]"
        />
        Ver finalizadas hace más de 30 días
      </label>
      {hasFilters && (
        <button
          className={`${cls} text-[#e2532a]`}
          onClick={() => router.push(vista ? `${pathname}?vista=${vista}` : pathname)}
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
