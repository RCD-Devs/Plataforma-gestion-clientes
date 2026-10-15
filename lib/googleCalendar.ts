// Google Calendar, solo lectura — cada persona vincula su propio
// calendario (OAuth de la app "REVO Plataforma", interna del Workspace) y
// sus reuniones se muestran en /perfil para cargarlas como horas. REVO
// nunca escribe en Google. Sin librería de Google: son tres llamadas REST.
import crypto from "crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];
export const GOOGLE_STATE_COOKIE = "revo_google_state";

export function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}

// Debe calzar exacto con una de las URIs registradas en Google Cloud.
export function redirectUri() {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ).replace(/\/+$/, "");
  return `${base}/api/google/callback`;
}

export function authorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    // offline + consent: así Google siempre entrega refresh token, también
    // al re-vincular una cuenta que ya había dado permiso antes.
    access_type: "offline",
    prompt: "consent select_account",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

// ── Cifrado del refresh token (AES-256-GCM) ────────────────────────────
// Clave derivada de AUTH_SECRET: si se rota el secreto, los tokens dejan
// de descifrarse y cada persona solo tiene que volver a vincular.
function tokenKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta AUTH_SECRET en las variables de entorno");
  return crypto
    .createHash("sha256")
    .update(`google-calendar-token:${secret}`)
    .digest();
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64url"))
    .join(".");
}

export function decryptToken(stored: string): string | null {
  try {
    const [iv, tag, data] = stored
      .split(".")
      .map((p) => Buffer.from(p, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}

// ── OAuth ──────────────────────────────────────────────────────────────

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...body,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, json };
}

// Canjea el código del callback. El email sale del id_token, que llega
// directo de Google por TLS en esta misma respuesta — no hace falta
// verificar su firma.
export async function exchangeCode(
  code: string,
): Promise<{ refreshToken: string; email: string } | null> {
  const { ok, json } = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
  });
  const refreshToken =
    typeof json.refresh_token === "string" ? json.refresh_token : null;
  const idToken = typeof json.id_token === "string" ? json.id_token : null;
  if (!ok || !refreshToken || !idToken) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"),
    );
    if (typeof payload.email !== "string") return null;
    return { refreshToken, email: payload.email };
  } catch {
    return null;
  }
}

export async function revokeToken(token: string) {
  await fetch(`${REVOKE_URL}?${new URLSearchParams({ token })}`, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

// ── Eventos ────────────────────────────────────────────────────────────

export type GoogleEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
};

type RawEvent = {
  id?: string;
  status?: string;
  summary?: string;
  eventType?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

// Tipos que no son reuniones (ubicación de trabajo, fuera de oficina,
// cumpleaños) — no tiene sentido cargarlos como horas.
const SKIPPED_TYPES = new Set(["workingLocation", "outOfOffice", "birthday"]);

// Puro, para poder probarlo: deja solo reuniones con hora (no de día
// completo), no canceladas y que la persona no rechazó.
export function toCalendarEvents(items: RawEvent[]): GoogleEvent[] {
  return items.flatMap((e) => {
    if (!e.id || e.status === "cancelled") return [];
    if (e.eventType && SKIPPED_TYPES.has(e.eventType)) return [];
    const start = e.start?.dateTime;
    const end = e.end?.dateTime;
    if (!start || !end) return [];
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined"))
      return [];
    const s = new Date(start);
    const en = new Date(end);
    if (isNaN(s.getTime()) || isNaN(en.getTime()) || en <= s) return [];
    return [
      {
        id: e.id,
        title: e.summary?.trim() || "(Sin título)",
        start: s.toISOString(),
        end: en.toISOString(),
      },
    ];
  });
}

export type GoogleFetchResult =
  | { status: "ok"; events: GoogleEvent[] }
  // El permiso ya no sirve (revocado desde Google, contraseña cambiada,
  // AUTH_SECRET rotado): hay que volver a vincular.
  | { status: "reconnect" }
  | { status: "error" };

// Nunca lanza: si Google no responde, el calendario de REVO se muestra
// igual, solo sin las reuniones.
export async function fetchGoogleEvents(
  storedToken: string,
  from: Date,
  to: Date,
): Promise<GoogleFetchResult> {
  try {
    return await fetchEvents(storedToken, from, to);
  } catch {
    return { status: "error" };
  }
}

async function fetchEvents(
  storedToken: string,
  from: Date,
  to: Date,
): Promise<GoogleFetchResult> {
  const refreshToken = decryptToken(storedToken);
  if (!refreshToken) return { status: "reconnect" };

  const { ok, json } = await tokenRequest({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (!ok)
    return { status: json.error === "invalid_grant" ? "reconnect" : "error" };
  const accessToken = String(json.access_token ?? "");

  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: "true", // expande las recurrentes en ocurrencias sueltas
    orderBy: "startTime",
    maxResults: "250",
    fields:
      "items(id,status,summary,eventType,start,end,attendees(self,responseStatus))",
  });
  const res = await fetch(`${EVENTS_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) return { status: "reconnect" };
  if (!res.ok) return { status: "error" };
  const body = (await res.json()) as { items?: RawEvent[] };
  return { status: "ok", events: toCalendarEvents(body.items ?? []) };
}
