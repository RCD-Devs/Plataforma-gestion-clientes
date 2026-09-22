"use client";

import { useState } from "react";
import Link from "next/link";

export type Slice = { label: string; value: number; color: string; href?: string };

const R = 40;
const C = 2 * Math.PI * R;

export const PALETTE = ["#0bdbcf", "#081826", "#fb693b", "#7c5cff", "#fda565", "#08a89f", "#c97416", "#d21f3c"];
export const OTHER_COLOR = "#c9d1d9";

// Top N + "Otras" agrupando el resto, con colores de la paleta — para
// cualquier donut de "¿en qué se fue X?" (horas por cliente, por tarea…).
export function toSlices(rows: { label: string; value: number; href?: string }[], max = 6): Slice[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, max).map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length] }));
  const rest = sorted.slice(max).reduce((a, r) => a + r.value, 0);
  return rest > 0 ? [...head, { label: "Otras", value: rest, color: OTHER_COLOR }] : head;
}

const fmt = (n: number, unit: string) => `${Math.round(n * 10) / 10}${unit}`;

// Donut con hover: pasar el mouse (o enfocar con teclado) por un segmento o por
// su fila de la leyenda muestra el detalle en el centro.
export function DonutChart({ slices, unit = " h" }: { slices: Slice[]; unit?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return <p className="text-sm text-[#7f7f7f]">Aún no hay datos.</p>;

  let acc = 0;
  const arcs = slices.map((s) => {
    const len = (s.value / total) * C;
    const arc = { len, offset: -acc };
    acc += len;
    return arc;
  });
  const cur = active !== null ? slices[active] : null;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          {slices.map((s, i) => (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={active === i ? 17 : 13}
              strokeDasharray={`${Math.max(arcs[i].len - 0.6, 0)} ${C}`}
              strokeDashoffset={arcs[i].offset}
              opacity={active === null || active === i ? 1 : 0.35}
              className="cursor-pointer transition-all duration-150"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-xl font-semibold leading-tight">
            {fmt(cur ? cur.value : total, unit)}
          </div>
          <div className="line-clamp-2 text-[11px] leading-tight text-[#5d6b77]">
            {cur ? `${cur.label} · ${Math.round((cur.value / total) * 100)}%` : "total"}
          </div>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-1">
        {slices.map((s, i) => {
          const inner = (
            <>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="shrink-0 font-semibold">{fmt(s.value, unit)}</span>
              <span className="w-9 shrink-0 text-right text-xs text-[#7f7f7f]">
                {Math.round((s.value / total) * 100)}%
              </span>
            </>
          );
          const cls = `flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${
            active === i ? "bg-[#f4f6f8]" : ""
          }`;
          return (
            <li
              key={i}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              {s.href ? (
                <Link href={s.href} className={cls}>
                  {inner}
                </Link>
              ) : (
                <div tabIndex={0} className={cls}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Selector de desglose (por sitio / por tarea / por tipo) sobre el mismo donut.
export function BreakdownTabs({
  tabs,
}: {
  tabs: { key: string; label: string; slices: Slice[] }[];
}) {
  const [key, setKey] = useState(tabs[0].key);
  const tab = tabs.find((t) => t.key === key) ?? tabs[0];
  return (
    <div>
      <div role="tablist" className="mb-4 inline-flex gap-1 rounded-lg border border-[#e4e8ec] p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === tab.key}
            onClick={() => setKey(t.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              t.key === tab.key ? "bg-[#081826] text-white" : "text-[#5d6b77] hover:bg-[#f4f6f8]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <DonutChart key={tab.key} slices={tab.slices} />
    </div>
  );
}

// Barras por mes con tooltip al pasar el mouse.
export function MonthBars({ bars }: { bars: { label: string; value: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...bars.map((b) => b.value), 0.1);
  return (
    <div>
      <div className="flex h-36 items-end gap-2">
        {bars.map((b, i) => (
          <div
            key={i}
            tabIndex={0}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="group relative flex h-full flex-1 flex-col justify-end"
          >
            {active === i && (
              <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-[#081826] px-2 py-1 text-[11px] font-semibold text-white">
                {b.label}: {fmt(b.value, " h")}
              </div>
            )}
            <div
              style={{ height: `${Math.max((b.value / max) * 100, b.value > 0 ? 4 : 1)}%` }}
              className={`rounded-t-md transition-colors ${
                active === i ? "bg-[#08a89f]" : "bg-[#0bdbcf]"
              } ${b.value === 0 ? "opacity-30" : ""}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2">
        {bars.map((b, i) => (
          <div key={i} className="flex-1 text-center text-[11px] capitalize text-[#7f7f7f]">
            {b.label}
          </div>
        ))}
      </div>
    </div>
  );
}
