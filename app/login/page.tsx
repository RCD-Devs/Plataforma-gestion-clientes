import Image from "next/image";
import Link from "next/link";
import { login } from "@/app/actions";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden overflow-hidden lg:flex lg:w-1/2">
        <Image
          src="/brand/gradiente.png"
          fill
          className="object-cover"
          alt=""
          priority
        />
        <div className="relative z-10 flex w-full flex-col justify-between p-12">
          <Image
            src="/brand/logo-blanco.png"
            width={150}
            height={67}
            alt="REVO"
          />
          <div>
            <div className="font-brand text-2xl font-bold text-white">
              Exploramos sin límites
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/85">
              Creemos en el poder de la exploración continua para desafiar los
              límites de lo establecido. Evolucionar y volver a evolucionar.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[#f4f6f8] p-6">
        <div className="w-full max-w-md rounded-2xl border border-[#e4e8ec] bg-white p-8">
          <Image
            src="/brand/logo-bajada.png"
            width={190}
            height={84}
            alt="REVO Business Evolution"
            className="mx-auto mb-2"
          />
          <div className="mb-6 text-center text-sm text-[#5d6b77]">
            Ingresa a tu cuenta
          </div>

          <button
            disabled
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg border border-[#e4e8ec] py-2.5 text-sm text-[#9ca3af]"
          >
            <span className="font-semibold">G</span> Continuar con Google
            <span className="ml-1 rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[10px]">
              pronto
            </span>
          </button>

          {error === "credenciales" && (
            <div className="mb-4 rounded-lg border border-[#fda565] bg-[#feede6] px-3 py-2 text-sm text-[#9a4a1e]">
              Correo o contraseña incorrectos.
            </div>
          )}
          {reset === "enviado" && (
            <div className="mb-4 rounded-lg border border-[#0bdbcf] bg-[#e0fbf9] px-3 py-2 text-sm text-[#065f5a]">
              Si el correo está registrado, te enviamos instrucciones para
              restablecer la contraseña.
            </div>
          )}
          {reset === "ok" && (
            <div className="mb-4 rounded-lg border border-[#0bdbcf] bg-[#e0fbf9] px-3 py-2 text-sm text-[#065f5a]">
              Contraseña actualizada. Ya puedes iniciar sesión.
            </div>
          )}

          <form action={login} className="space-y-3">
            <input type="hidden" name="target" value="login" />
            <div>
              <label className="mb-1 block text-sm font-semibold">
                Correo
              </label>
              <input
                name="email"
                type="email"
                required
                placeholder="nombre@revo.cl"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold">
                Contraseña
              </label>
              <input
                name="password"
                type="password"
                required
                placeholder="••••••••"
                className={inputCls}
              />
            </div>
            <button className="w-full rounded-lg bg-[#0bdbcf] py-2.5 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
              Ingresar
            </button>
          </form>
          <div className="mt-4 text-center text-xs text-[#7f7f7f]">
            <Link
              href="/recuperar-contrasena?target=login"
              className="hover:text-[#08a89f] hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
