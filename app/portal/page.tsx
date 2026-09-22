import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { getSessionUser } from "@/lib/session";
import { login, logout } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PortalShell } from "@/components/portal/PortalShell";
import { PortalDashboard } from "@/components/portal/PortalDashboard";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-[#e4e8ec] px-3 py-2 text-sm outline-none focus:border-[#0bdbcf]";

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;
  const session = await getPortalContext();
  if (session?.user.mustChangePassword) redirect("/cambiar-clave");

  // Sesión de equipo (no CLIENTE) sin ningún cliente asignado en
  // /admin/usuarios: mostrar el login del portal acá sería engañoso —
  // ya está autenticado, solo le falta el acceso, no una contraseña.
  if (!session) {
    const user = await getSessionUser();
    if (user && user.role !== "CLIENTE") {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] p-6">
          <div className="w-full max-w-md rounded-2xl border border-[#e4e8ec] bg-white p-8 text-center">
            <div className="mb-3 text-3xl" aria-hidden>
              🔒
            </div>
            <h1 className="font-brand text-lg font-semibold">Sin acceso al portal</h1>
            <p className="mt-2 text-sm text-[#5d6b77]">
              Tu cuenta ({user.email}) no tiene asignado ningún cliente para ver como portal. Pídele a un Admin
              que te lo asigne en Administración → Usuarios → tu cuenta → &ldquo;Acceso al portal de
              clientes&rdquo;.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {user.roleCodes.includes("ADMIN") && (
                <Link
                  href="/admin/usuarios"
                  className="rounded-lg bg-[#0bdbcf] py-2.5 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]"
                >
                  Ir a Administración → Usuarios
                </Link>
              )}
              <Link
                href="/mi-espacio"
                className="rounded-lg border border-[#e4e8ec] py-2.5 text-sm text-[#5d6b77] hover:bg-[#f4f6f8]"
              >
                ← Volver a Mi espacio
              </Link>
              <form action={logout}>
                <button className="w-full text-xs text-[#7f7f7f] hover:underline">Cerrar sesión</button>
              </form>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen">
        <div className="relative hidden overflow-hidden lg:flex lg:w-1/2">
          <Image
            src="/brand/gradiente-2.png"
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
                Portal del cliente
              </div>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/85">
                Ingresa tus solicitudes, sigue su estado y conversa con el
                equipo, todo en un solo lugar.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center bg-[#f4f6f8] p-6">
          <form
            action={login}
            className="w-full max-w-md rounded-2xl border border-[#e4e8ec] bg-white p-8"
          >
            <input type="hidden" name="target" value="portal" />
            <Image
              src="/brand/logo-bajada.png"
              width={190}
              height={84}
              alt="REVO Business Evolution"
              className="mx-auto mb-2"
            />
            <p className="mb-5 text-center text-sm text-[#5d6b77]">
              Ingresa con tu correo de empresa
            </p>
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
            <label className="mb-1 block text-sm font-semibold">
              Tu correo
            </label>
            <input
              name="email"
              type="email"
              required
              placeholder="nombre@tuempresa.cl"
              className={inputCls}
            />
            <label className="mb-1 mt-3 block text-sm font-semibold">
              Contraseña
            </label>
            <input
              name="password"
              type="password"
              required
              placeholder="••••••••"
              className={inputCls}
            />
            <SubmitButton
              className="mt-4 w-full rounded-lg bg-[#0bdbcf] py-2.5 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]"
              pendingLabel="Ingresando…"
            >
              Ingresar al portal
            </SubmitButton>
            <div className="mt-3 text-center text-xs text-[#7f7f7f]">
              <Link
                href="/recuperar-contrasena?target=portal"
                className="hover:text-[#08a89f] hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <div className="mt-2 text-center text-xs text-[#7f7f7f]">
              <Link href="/privacidad" target="_blank" className="hover:underline">
                Aviso de privacidad
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const { client } = session;
  return (
    <PortalShell
      clientName={client.name}
      email={session.user.email}
      viewAs={session.viewAs}
      clients={session.clients}
      activeClientId={client.id}
    >
      <PortalDashboard client={client} />
    </PortalShell>
  );
}
