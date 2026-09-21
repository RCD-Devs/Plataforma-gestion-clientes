import Image from "next/image";
import { resetPassword } from "@/app/actions";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { hashResetToken, tokenRecordProblem } from "@/lib/reset-token";
import { PasswordFields } from "@/components/PasswordFields";

export const dynamic = "force-dynamic";

export default async function RestablecerContrasenaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const record = token
    ? await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) } })
    : null;
  const tokenProblem = token ? tokenRecordProblem(record) : null;

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

        {!token || tokenProblem ? (
          <div className="space-y-3 text-center text-sm text-[#9a4a1e]">
            <p>{tokenProblem ?? "Falta el enlace. Abre el enlace completo del correo."}</p>
            <Link href="/recuperar-contrasena" className="font-semibold text-[#08a89f] hover:underline">
              Pedir un enlace nuevo
            </Link>
          </div>
        ) : (
          <form action={resetPassword} className="space-y-3">
            <input type="hidden" name="token" value={token} />
            <PasswordFields name="password" />
          </form>
        )}
      </div>
    </div>
  );
}
