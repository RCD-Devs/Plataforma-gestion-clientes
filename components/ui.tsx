import type { ReactNode } from "react";
import { STATUS_MAP, PRIORITY_MAP } from "@/lib/constants";
import { initials } from "@/lib/format";

export function Avatar({
  name,
  color,
  size = 24,
}: {
  name: string;
  color?: string | null;
  size?: number;
}) {
  return (
    <span
      title={name}
      style={{
        width: size,
        height: size,
        background: color || "#9ca3af",
        fontSize: Math.round(size * 0.4),
      }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white"
    >
      {initials(name)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status];
  if (!s) return <span className="text-xs">{status}</span>;
  return (
    <span
      style={{ background: s.soft, color: s.color }}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
    >
      <span style={{ background: s.color }} className="h-1.5 w-1.5 rounded-full" />
      {s.label}
    </span>
  );
}

export function PriorityTag({ priority }: { priority: string }) {
  const p = PRIORITY_MAP[priority];
  if (!p) return null;
  return (
    <span
      style={{ color: p.color }}
      className="inline-flex items-center gap-1 text-xs font-medium"
    >
      <span style={{ background: p.color }} className="h-2 w-2 rounded-full" />
      {p.label}
    </span>
  );
}

export function ClientTag({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[11px] font-medium text-[#4b5563]">
      {name}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#e4e8ec] bg-white p-4">
      <div className="text-sm text-[#6b7280]">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-[#6b7280]">{hint}</div>}
    </div>
  );
}

export function Bar({ pct, color = "#08a89f" }: { pct: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
      <div
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
        className="h-full rounded-full"
      />
    </div>
  );
}
