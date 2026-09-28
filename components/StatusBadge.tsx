import { getStatusMap, softBg } from "@/lib/statuses";

// Componente de servidor (lee los estados de la BD). Separado de ui.tsx,
// que también se usa desde componentes de cliente.
export async function StatusBadge({ status }: { status: string }) {
  const map = await getStatusMap();
  const s = map[status];
  if (!s) return <span className="text-xs">{status}</span>;
  return (
    <span
      style={{ background: softBg(s.color), color: s.color }}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
    >
      <span style={{ background: s.color }} className="h-1.5 w-1.5 rounded-full" />
      {s.label}
    </span>
  );
}
