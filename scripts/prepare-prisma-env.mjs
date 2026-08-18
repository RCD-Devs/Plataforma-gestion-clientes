import { readFileSync, writeFileSync, existsSync } from "node:fs";

const candidates = [
  ".env",
  ".vercel/.env.production.local",
  ".env.production",
];

function parseDotenv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    for (let i = 0; i < 2; i++) {
      if (
        (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
        (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
      ) {
        val = val.slice(1, -1);
      }
    }
    out[key] = val;
  }
  return out;
}

function scheme(url) {
  if (!url) return "(missing)";
  const i = url.indexOf("://");
  return i === -1 ? `(no-scheme: ${url.slice(0, 16)})` : url.slice(0, i);
}

function isPostgres(url) {
  const s = scheme(url);
  return s === "postgresql" || s === "postgres";
}

let env = {};
for (const file of candidates) {
  if (!existsSync(file)) continue;
  Object.assign(env, parseDotenv(readFileSync(file, "utf8")));
}

let databaseUrl = env.DATABASE_URL || "";
let directUrl = env.DIRECT_URL || "";

if (!isPostgres(databaseUrl) && isPostgres(directUrl)) databaseUrl = directUrl;
if (!isPostgres(directUrl) && isPostgres(databaseUrl)) directUrl = databaseUrl;

console.log("DATABASE_URL scheme:", scheme(databaseUrl));
console.log("DIRECT_URL scheme:", scheme(directUrl));

if (!isPostgres(databaseUrl)) {
  console.error(
    "DATABASE_URL no es una URI de Postgres. En Vercel debe empezar por postgresql:// (sin comillas extra).",
  );
  process.exit(1);
}

const escape = (v) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
writeFileSync(
  ".env",
  `DATABASE_URL="${escape(databaseUrl)}"\nDIRECT_URL="${escape(directUrl)}"\n`,
);
console.log("Wrote .env for Prisma");
