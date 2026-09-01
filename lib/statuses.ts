import { cache } from "react";
import { prisma } from "./db";

// Estados de tablero editables por Admin (Rec. #36, entrega 2, 2026-09-01)
// — reemplaza el STATUSES/STATUS_MAP hardcodeado de lib/constants.ts.
// cache() de React memoiza por request: aunque se llame decenas de veces
// en una misma página (una por fila de tabla), solo hace una consulta.

export type StatusInfo = {
  code: string;
  label: string;
  color: string;
  sortOrder: number;
  isFinal: boolean;
};

export const getStatuses = cache(async (): Promise<StatusInfo[]> => {
  const rows = await prisma.status.findMany({
    where: { archivedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  return rows;
});

export const getStatusMap = cache(async (): Promise<Record<string, StatusInfo>> => {
  const list = await getStatuses();
  return Object.fromEntries(list.map((s) => [s.code, s]));
});

// Fondo suave derivado del color principal — evita guardar un segundo
// campo "soft" en la base, se calcula al vuelo con color-mix.
export function softBg(color: string): string {
  return `color-mix(in srgb, ${color} 14%, white)`;
}
