import Image from "next/image";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function RecuperarContrasenaPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string }>;
}) {
  const { target } = await searchParams;
  const isPortal = target === "portal";
  const backHref = isPortal ? "/portal" : "/login";

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
          Ingresa tu correo y te enviamos instrucciones para elegir una
          contraseña nueva.
        </p>

        <form action={requestPasswordReset} className="space-y-3">
          <input type="hidden" name="target" value={isPortal ? "portal" : "login"} />
          <div>
            <label className="mb-1 block text-sm font-semibold">
              Correo
            </label>
            <input name="email" type="email" required className={inputCls} />
          </div>
          <button className="w-full rounded-lg bg-[#0bdbcf] py-2.5 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]">
            Enviar instrucciones
          </button>
        </form>
        <div className="mt-4 text-center text-xs text-[#7f7f7f]">
          <Link href={backHref} className="hover:text-[#08a89f] hover:underline">
            ← Volver
          </Link>
        </div>
      </div>
    </div>
  );
}
