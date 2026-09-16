"use client";

import { useEffect, useState } from "react";
import { NudgeBanner } from "./NudgeBanner";
import type { NudgeItem } from "@/lib/nudges";

// Nuevo #16 — envuelve NudgeBanner con un EventSource: el cálculo inicial
// (server-side, en la carga de /mi-espacio) sigue igual, pero desde acá se
// actualiza solo si cambia mientras la pestaña queda abierta, sin esperar
// a la próxima recarga.
export function NudgeStream({ initial }: { initial: NudgeItem[] | null }) {
  const [items, setItems] = useState<NudgeItem[]>(initial ?? []);

  useEffect(() => {
    const source = new EventSource("/api/nudges/stream");
    source.onmessage = (event) => {
      try {
        setItems(JSON.parse(event.data));
      } catch {
        // Mensaje corrupto — se ignora, el próximo tick trae uno bueno.
      }
    };
    return () => source.close();
  }, []);

  if (items.length === 0) return null;
  // key fuerza a NudgeBanner a remontar (y perder el "Cerrar" previo) cuando
  // cambia el conjunto de avisos — un aviso nuevo no debería quedar oculto
  // solo porque se cerró uno anterior distinto.
  return <NudgeBanner key={items.map((i) => i.kind).join(",")} items={items} />;
}
