import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { getSessionUser } from "@/lib/session";
import { logout } from "@/app/actions";
import { PortalShell } from "@/components/portal/PortalShell";
import { PortalDashboard } from "@/components/portal/PortalDashboard";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const session = await getPortalContext();
  if (session?.user.mustChangePassword) redirect("/cambiar-clave");

  // Sesión de equipo (no CLIENTE) sin ningún cliente asignado en
  // /admin/usuarios: ya está autenticado, solo le falta el acceso. Sin
  // sesión, al login único.
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
    redirect("/login");
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
