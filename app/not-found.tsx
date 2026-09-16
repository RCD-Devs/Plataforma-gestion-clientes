import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#e6e8eb] bg-white p-6 text-center">
        <Image
          src="/brand/logo.png"
          alt="REVO"
          width={120}
          height={53}
          className="mx-auto mb-4"
        />
        <h1 className="text-base font-semibold text-[#111827]">
          No encontramos esta página
        </h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          El link puede estar mal escrito o la página ya no existe.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-lg bg-[#0bdbcf] px-4 py-2 text-sm font-semibold text-[#081826] hover:bg-[#09c4ba]"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
