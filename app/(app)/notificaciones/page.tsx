import { prisma } from "@/lib/db";
import { relative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function NotificacionesPage() {
  const [notifs, activities] = await Promise.all([
    prisma.notification.findMany({
      where: { channel: "email" },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.activity.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { request: true },
    }),
  ]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e6e8eb] bg-white px-6 py-3">
        <h1 className="font-brand text-base font-semibold">Notificaciones</h1>
        <p className="text-xs text-[#6b7280]">
          Correos enviados a clientes y actividad reciente del equipo
        </p>
      </header>
      <div className="grid flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[#6b7280]">
            Correos a clientes
          </h2>
          <div className="space-y-2">
            {notifs.map((n) => (
              <div
                key={n.id}
                className="rounded-xl border border-[#e6e8eb] bg-white p-3"
              >
                <div className="flex items-center justify-between text-xs text-[#6b7280]">
                  <span>{n.recipientEmail}</span>
                  <span>{relative(n.createdAt)}</span>
                </div>
                <div className="mt-0.5 text-sm font-medium">{n.title}</div>
                <div className="text-sm text-[#6b7280]">{n.body}</div>
              </div>
            ))}
            {notifs.length === 0 && (
              <div className="text-sm text-[#9ca3af]">
                Aún no se han enviado correos.
              </div>
            )}
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[#6b7280]">
            Actividad del equipo
          </h2>
          <div className="space-y-2">
            {activities.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-[#e6e8eb] bg-white px-3 py-2 text-sm"
              >
                <span className="font-medium">{a.actorName}</span>{" "}
                <span className="text-[#6b7280]">{a.message}</span>
                <span className="text-[#9ca3af]">
                  {" "}
                  · {a.request.key} · {relative(a.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
