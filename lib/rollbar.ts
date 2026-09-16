import Rollbar from "rollbar";

// Nombres largos porque los generó el marketplace de Vercel al provisionar
// el recurso (Rec. #74) — no renombrar sin actualizar las env vars en Vercel.
const CLIENT_TOKEN =
  process.env.NEXT_PUBLIC_ROLLBAR_PLATAFORMA_GESTION_CLIENTES_CLIENT_TOKEN_1789532465;
const SERVER_TOKEN =
  process.env.ROLLBAR_PLATAFORMA_GESTION_CLIENTES_SERVER_TOKEN_1789532465;

const baseConfig = {
  captureUncaught: true,
  captureUnhandledRejections: true,
  environment: process.env.NODE_ENV,
};

export const clientConfig = {
  accessToken: CLIENT_TOKEN,
  enabled: Boolean(CLIENT_TOKEN),
  ...baseConfig,
};

export const serverInstance = new Rollbar({
  accessToken: SERVER_TOKEN,
  enabled: Boolean(SERVER_TOKEN),
  ...baseConfig,
});
