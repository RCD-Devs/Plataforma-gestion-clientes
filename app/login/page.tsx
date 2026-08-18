import Image from "next/image";
import { prisma } from "@/lib/db";
import { login } from "@/app/actions";
import { Avatar } from "@/components/ui";
import { ROLE_MAP } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = await prisma.user.findMany({
    where: { role: { not: "CLIENTE" } },
    orderBy: { name: "asc" },
  });

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

          <div className="mb-3 text-center text-[10px] uppercase tracking-widest text-[#7f7f7f]">
            Acceso de demo
          </div>
          <div className="space-y-2">
            {users.map((u) => (
              <form key={u.id} action={login}>
                <input type="hidden" name="userId" value={u.id} />
                <button className="flex w-full items-center gap-3 rounded-lg border border-[#e4e8ec] p-2.5 text-left hover:border-[#0bdbcf] hover:bg-[#f0fdfc]">
                  <Avatar name={u.name} color={u.color} size={34} />
                  <div>
                    <div className="text-sm font-medium">{u.name}</div>
                    <div className="text-xs text-[#5d6b77]">
                      {ROLE_MAP[u.role]?.label ?? u.role}
                    </div>
                  </div>
                </button>
              </form>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
