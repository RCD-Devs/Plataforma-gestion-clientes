import type { NextConfig } from "next";

// CSP con 'unsafe-inline' en script/style porque el App Router de Next.js
// inyecta el payload de hidratación como <script> inline (necesita nonce
// para evitarlo, no implementado aquí) y React compila `style={{}}` a
// atributos style="" inline, usados en varias vistas. Igual bloquea lo
// que más importa: cargar scripts/recursos desde un origen externo.
const CSP = [
  "default-src 'self'",
  // 'unsafe-eval' solo en `next dev`: su runtime (React Refresh) usa eval y
  // sin esto la página nunca hidrata en local. El build de producción no lo usa.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // api.rollbar.com: sin esto, el reporte de errores del navegador
  // (app/error.tsx, app/global-error.tsx) queda bloqueado en silencio y
  // nunca llega — se detectó investigando un 500 en producción sin poder
  // ver el detalle real del error en ningún lado.
  "connect-src 'self' https://api.rollbar.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
