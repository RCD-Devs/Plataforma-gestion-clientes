import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE_NAME = "revo_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// Nuevo #17 (auditoría de gaps, 2 sep 2026) — Codia Task rechaza el
// arranque en producción con un secreto débil o de ejemplo; acá se
// replica en el mismo punto único donde ya se leía AUTH_SECRET, en vez
// de un hook de arranque aparte (no hay uno en el resto del proyecto).
const WEAK_SECRETS = new Set([
  "changeme",
  "change-me",
  "secret",
  "supersecret",
  "example",
  "test",
  "password",
  "12345678",
  "your-secret-here",
]);

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("Falta AUTH_SECRET en las variables de entorno");
  if (process.env.NODE_ENV === "production") {
    const normalized = value.trim().toLowerCase();
    if (value.trim().length < 32 || WEAK_SECRETS.has(normalized)) {
      throw new Error(
        "AUTH_SECRET es débil o de ejemplo — genera uno real de al menos 32 caracteres (ej. openssl rand -base64 48) antes de producción.",
      );
    }
  }
  return value;
}

export async function createSession(userId: string) {
  const token = jwt.sign({ sub: userId }, secret(), {
    expiresIn: MAX_AGE_SECONDS,
  });
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// Único punto de verdad de sesión — un cliente del portal es un User más
// (role: "CLIENTE" + clientId), no un mecanismo aparte.
export async function getSessionUser() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let userId: string;
  try {
    const payload = jwt.verify(token, secret());
    if (typeof payload === "string" || !payload.sub) return null;
    userId = payload.sub;
  } catch {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { team: true, client: true },
  });
  if (!user || !user.isActive) return null;
  return user;
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

export function redirectForRole(user: Pick<SessionUser, "role">) {
  if (user.role === "CLIENTE") return "/portal";
  if (user.role === "LIDER_AREA" || user.role === "ADMIN") return "/equipo";
  return "/mi-espacio";
}
