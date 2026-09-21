import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { logout } from "@/app/actions";
import { PortalNav } from "./PortalNav";

export function PortalShell({
  clientName,
  email,
  children,
}: {
  clientName: string;
  email: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f4f6f8]">
      <header className="border-b border-[#e4e8ec] bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/portal">
              <Image src="/brand/logo.png" alt="REVO" width={96} height={43} />
            </Link>
            <div className="hidden h-8 w-px bg-[#e4e8ec] sm:block" />
            <div className="hidden font-brand text-sm font-semibold sm:block">
              Portal del cliente
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold">{clientName}</div>
              <div className="text-xs text-[#5d6b77]">{email}</div>
            </div>
            <form action={logout}>
              <button className="rounded-lg border border-[#e4e8ec] px-3 py-1.5 text-xs text-[#5d6b77] hover:bg-[#f4f6f8]">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:grid md:grid-cols-[200px_1fr] md:gap-6">
        <aside className="mb-4 md:mb-0 md:sticky md:top-6 md:self-start">
          <PortalNav />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
