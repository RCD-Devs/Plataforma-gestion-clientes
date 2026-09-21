"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/portal", label: "Inicio", icon: "🏠", match: (p: string) => p === "/portal" },
  {
    href: "/portal/solicitudes",
    label: "Mis solicitudes",
    icon: "📋",
    match: (p: string) => p.startsWith("/portal/solicitud"),
  },
  { href: "/portal/nueva", label: "Nueva solicitud", icon: "➕", match: (p: string) => p === "/portal/nueva" },
];

// Sidebar en desktop, barra horizontal en móvil.
export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.map((i) => {
        const active = i.match(pathname);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
              active
                ? "bg-[#e0fbf9] font-semibold text-[#065f5a]"
                : "text-[#5d6b77] hover:bg-[#f4f6f8]"
            }`}
          >
            <span aria-hidden>{i.icon}</span>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
