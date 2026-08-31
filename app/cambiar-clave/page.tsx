import Image from "next/image";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { changePassword } from "@/app/actions";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function CambiarClavePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;

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
        <p className="mb-1 text-center text-sm font-semibold">
          {user.passwordHash
            ? "Actualiza tu contraseña"
            : "Elige tu contraseña"}
        </p>
        <p className="mb-5 text-center text-xs text-[#5d6b77]">
          {user.passwordHash
            ? "Por seguridad, necesitas cambiarla antes de continuar."
            : "Es tu primer ingreso — define una contraseña para tu cuenta."}
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
            {error === "no_coincide"
              ? "Las contraseñas nuevas no coinciden."
              : error === "actual_incorrecta"
                ? "La contraseña actual no es correcta."
                : decodeURIComponent(error)}
          </div>
        )}

        <form action={changePassword} className="space-y-3">
          {user.passwordHash && (
            <div>
              <label className="mb-1 block text-sm font-semibold">
                Contraseña actual
              </label>
              <input
                name="currentPassword"
                type="password"
                required
                className={inputCls}
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-semibold">
              Contraseña nueva
            </label>
            <input
              name="newPassword"
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
      </div>
    </div>
  );
}
