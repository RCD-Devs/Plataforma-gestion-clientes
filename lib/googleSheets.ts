import jwt from "jsonwebtoken";

// Escritura en Google Sheets con una cuenta de servicio (sin la librería
// googleapis: un JWT firmado → token → 2 llamadas REST). La planilla debe
// estar compartida como Editor con el correo de la cuenta de servicio.
// GOOGLE_SERVICE_ACCOUNT_JSON = el JSON de la llave, tal cual.

async function accessToken(): Promise<string> {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}") as {
    client_email?: string;
    private_key?: string;
  };
  if (!sa.client_email || !sa.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON incompleto");
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    sa.private_key,
    { algorithm: "RS256" },
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

// Reemplaza TODO el contenido de la pestaña por `values` (fila 1 = encabezado).
export async function replaceSheetTab(spreadsheetId: string, tab: string, values: (string | number)[][]) {
  const token = await accessToken();
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values`;
  const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'`);
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const clear = await fetch(`${base}/${range}:clear`, { method: "POST", headers });
  if (!clear.ok) throw new Error(`Sheets clear ${clear.status}: ${await clear.text()}`);
  // RAW: "oct 2026" queda como texto (no lo convierte en fecha); los números quedan números.
  const put = await fetch(`${base}/${range}!A1?valueInputOption=RAW`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ values }),
  });
  if (!put.ok) throw new Error(`Sheets update ${put.status}: ${await put.text()}`);
}
