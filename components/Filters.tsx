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
}: {
  clients: Opt[];
  users: Opt[];
  teams: Opt[];
  projects: Opt[];
  statuses: StatusInfo[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const cls =
    "h-8 rounded-md border border-[#e4e8ec] bg-white px-2 text-sm text-[#374151] outline-none focus:border-[#0bdbcf]";
  const hasFilters = [...sp.keys()].length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        defaultValue={sp.get("q") ?? ""}
        placeholder="Buscar…"
        className={`${cls} w-44`}
        onKeyDown={(e) => {
          if (e.key === "Enter")
            setParam("q", (e.target as HTMLInputElement).value);
        }}
      />
      <select
        className={cls}
        value={sp.get("cliente") ?? ""}
        onChange={(e) => setParam("cliente", e.target.value)}
      >
        <option value="">Cliente</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
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
      <select
        className={cls}
        value={sp.get("proyecto") ?? ""}
        onChange={(e) => setParam("proyecto", e.target.value)}
      >
        <option value="">Proyecto</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
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
      <label className="flex items-center gap-1 text-xs text-[#6b7280]">
        <input
          type="checkbox"
          checked={sp.get("archivadas") === "1"}
          onChange={(e) => setParam("archivadas", e.target.checked ? "1" : "")}
          className="h-3.5 w-3.5 accent-[#0bdbcf]"
        />
        Ver archivadas
      </label>
      {hasFilters && (
        <button
          className={`${cls} text-[#e2532a]`}
          onClick={() => router.push(pathname)}
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
