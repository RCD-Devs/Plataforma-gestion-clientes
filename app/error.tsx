"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRollbar } from "@rollbar/react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const rollbar = useRollbar();
  useEffect(() => {
    console.error(error);
    rollbar.error(error);
  }, [error, rollbar]);

  return (
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
          datos). Intenta de nuevo en unos segundos; si sigue pasando, avísale
          al equipo.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            onClick={() => reset()}
            className="rounded-lg bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="rounded-lg border border-[#e6e8eb] px-4 py-2 text-sm font-semibold text-[#111827] hover:bg-[#f4f6f8]"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
