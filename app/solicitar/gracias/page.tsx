import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function GraciasPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const user = await getSessionUser();
  if (!user || user.role === "CLIENTE") redirect("/login");
  const { key } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#e6e8eb] bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e6f7f0] text-2xl text-[#0e9f6e]">
          ✓
        </div>
        <h1 className="text-lg font-semibold">¡Solicitud recibida!</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Tu folio es{" "}
          <span className="font-semibold text-[#111827]">{key}</span>. El
          solicitante recibió un correo de confirmación y se le avisará cada
          cambio de estado.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            href={key ? `/solicitudes/${key}` : "/solicitudes"}
            className="rounded-lg bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]"
          >
            Ver solicitud
          </Link>
          <Link
            href="/solicitar"
            className="rounded-lg border border-[#e6e8eb] px-4 py-2 text-sm"
          >
            Nueva solicitud
          </Link>
        </div>
      </div>
    </div>
  );
}
