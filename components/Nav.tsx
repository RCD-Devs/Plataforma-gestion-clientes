"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import { Avatar } from "./ui";
import { ROLE_MAP } from "@/lib/constants";

const items = [
  { href: "/mi-espacio", label: "Mi espacio", icon: "▣" },
  { href: "/equipo", label: "Mi equipo", icon: "♟", leader: true },
  { href: "/tablero", label: "Tablero", icon: "▦" },
  { href: "/solicitudes", label: "Solicitudes", icon: "☰" },
  { href: "/clientes", label: "Clientes", icon: "◎" },
  { href: "/bolsa", label: "Bolsa de horas", icon: "◷" },
  { href: "/dashboard", label: "Dashboard", icon: "▤" },
  { href: "/notificaciones", label: "Notificaciones", icon: "✷" },
];

export function Sidebar({
  user,
}: {
  user: { name: string; role: string; email: string; color?: string | null };
}) {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-[#0e2436] bg-[#081826]">
      <div className="px-5 pb-4 pt-5">
        <Image
          src="/brand/logo.png"
          alt="REVO"
          width={104}
          height={46}
          priority
        />
        <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
          Gestión de clientes
        </div>
      </div>

      <nav className="flex-1 px-3 py-2">
        {items.map((it) => {
          if (it.leader && user.role !== "LIDER_AREA" && user.role !== "ADMIN")
            return null;
          const active =
            pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-[#0bdbcf]/10 font-semibold text-[#0bdbcf]"
                  : "text-white/80 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="w-4 text-center text-base">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
        <div className="mx-3 my-3 border-t border-white/10" />
        <Link
          href="/solicitar"
          target="_blank"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white"
        >
          <span className="w-4 text-center text-base">↗</span>
          Formulario público
        </Link>
        <Link
          href="/portal"
          target="_blank"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white"
        >
          <span className="w-4 text-center text-base">◑</span>
          Portal del cliente
        </Link>
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2">
          <Avatar name={user.name} color={user.color} size={30} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-white">
              {user.name}
            </div>
            <div className="truncate text-[11px] text-white/60">
              {ROLE_MAP[user.role]?.label ?? user.role}
            </div>
          </div>
        </div>
        <form action={logout} className="mt-2">
          <button className="w-full rounded-md border border-white/15 py-1.5 text-xs text-white/80 hover:bg-white/5 hover:text-white">
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
