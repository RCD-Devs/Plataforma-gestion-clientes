import Image from "next/image";
import { resetPassword } from "@/app/actions";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function RestablecerContrasenaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#e4e8ec] bg-white p-8">
        <Image
          src="/brand/logo-bajada.png"
          width={190}
          height={84}
          alt="REVO Business Evolution"
          className="mx-auto mb-2"
        />
        <p className="mb-5 text-center text-sm text-[#5d6b77]">
          Elige tu nueva contraseña.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
            {decodeURIComponent(error)}
          </div>
        )}

        {!token ? (
          <p className="text-center text-sm text-[#9a4a1e]">
            Falta el enlace de recuperación.
          </p>
        ) : (
          <form action={resetPassword} className="space-y-3">
            <input type="hidden" name="token" value={token} />
            <div>
              <label className="mb-1 block text-sm font-semibold">
                Contraseña nueva
              </label>
              <input
                name="password"
                type="password"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold">
                Repite la contraseña nueva
              </label>
              <input
                name="confirmPassword"
                type="password"
                required
                className={inputCls}
              />
            </div>
            <p className="text-xs text-[#7f7f7f]">
              Mínimo 8 caracteres, con una mayúscula y un símbolo (! @ # $ % & * ? + -).
            </p>
            <button className="w-full rounded-lg bg-[#0bdbcf] py-2.5 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
              Guardar contraseña
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
