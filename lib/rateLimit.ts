import { headers } from "next/headers";

// Limitador simple en memoria, por proceso. No sobrevive a un cold start ni
// se comparte entre instancias serverless — para el tráfico de una
// herramienta interna de agencia (ADR-010) alcanza para frenar abuso
// sostenido; si el tráfico crece, esto se reemplaza por un store
// compartido (Upstash/Vercel KV) sin cambiar la firma de rateLimit().
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  if (Math.random() < 0.01) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

// IP del cliente detrás del proxy de Vercel. No confiable si el deploy no
// está detrás de un proxy que la fije (localhost cae en el fallback).
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}
