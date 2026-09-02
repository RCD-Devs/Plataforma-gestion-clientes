"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import { Avatar } from "./ui";
import { ROLE_MAP } from "@/lib/constants";
import { isManager } from "@/lib/authz";

const items = [
  { href: "/mi-espacio", label: "Mi espacio", icon: "▣" },
  { href: "/equipo", label: "Mi equipo", icon: "♟", leader: true },
  { href: "/tablero", label: "Tablero", icon: "▦" },
  { href: "/solicitudes", label: "Solicitudes", icon: "☰" },
  { href: "/clientes", label: "Clientes", icon: "◎", manager: true },
  { href: "/bolsa", label: "Bolsa de horas", icon: "◷", manager: true },
  { href: "/dashboard", label: "Dashboard", icon: "▤", manager: true },
  { href: "/notificaciones", label: "Notificaciones", icon: "✷", manager: true },
  { href: "/admin", label: "Administración", icon: "⚙", admin: true },
];

export function Sidebar({
  user,
}: {
  user: { name: string; role: string; email: string; color?: string | null };
}) {
  const pathname = usePathname();
  // Rec. #86 — el sidebar fijo de 240px no cabía en tablet/mobile. Bajo
  // el breakpoint md se convierte en un cajón (drawer) que se abre con el
  // botón hamburguesa; desde md hacia arriba vuelve al sidebar estático
  // de siempre (md:static md:translate-x-0 anula el drawer).
  const [open, setOpen] = useState(false);
  const closeOnNavigate = () => setOpen(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-[#0e2436] bg-[#081826] px-4 py-2.5 md:hidden">
        <Image src="/brand/logo.png" alt="REVO" width={84} height={37} />
        <button
          type="button"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 text-lg text-white/80 hover:bg-white/10 hover:text-white"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {open && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-60 shrink-0 flex-col border-r border-[#0e2436] bg-[#081826] transition-transform duration-200 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="hidden px-5 pb-4 pt-5 md:block">
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

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {items.map((it) => {
            if (it.leader && user.role !== "LIDER_AREA" && user.role !== "ADMIN")
              return null;
            if (it.manager && !isManager(user.role)) return null;
            if (it.admin && user.role !== "ADMIN") return null;
            const active =
              pathname === it.href || pathname.startsWith(it.href + "/");
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={closeOnNavigate}
                className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-[#0bdbcf]/10 font-semibold text-[#0bdbcf]"
                    : "text-white/80 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="w-4 text-center text-base" aria-hidden="true">
                  {it.icon}
                </span>
                {it.label}
              </Link>
            );
          })}
          <div className="mx-3 my-3 border-t border-white/10" />
          <Link
            href="/solicitar"
            target="_blank"
            onClick={closeOnNavigate}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white"
          >
            <span className="w-4 text-center text-base" aria-hidden="true">↗</span>
            Formulario público
          </Link>
          <Link
            href="/portal"
            target="_blank"
            onClick={closeOnNavigate}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white"
          >
            <span className="w-4 text-center text-base" aria-hidden="true">◑</span>
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
    </>
  );
}
