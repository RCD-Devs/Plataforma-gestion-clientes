"use client";

import { useEffect } from "react";
import Rollbar from "rollbar";
import { clientConfig } from "@/lib/rollbar";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // El layout raíz (y su RollbarProvider) no está disponible acá, por
    // eso se crea una instancia nueva en vez de usar useRollbar().
    new Rollbar(clientConfig).error(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-4">
          <div className="w-full max-w-md rounded-2xl border border-[#e6e8eb] bg-white p-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#fdf1e3] text-[#9a5a25]">
              !
            </div>
            <h1 className="text-base font-semibold text-[#111827]">
              Algo falló de nuestro lado
            </h1>
            <p className="mt-2 text-sm text-[#6b7280]">
              Puede ser algo pasajero (por ejemplo, una conexión a la base de
              datos). Intenta de nuevo en unos segundos; si sigue pasando,
              avísale al equipo.
            </p>
            <div className="mt-5 flex justify-center">
              <button
                onClick={() => reset()}
                className="rounded-lg bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
