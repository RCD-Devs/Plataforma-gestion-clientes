"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/equipos", label: "Equipos" },
  { href: "/admin/campos", label: "Campos personalizados" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="mt-3 flex gap-1">
      {tabs.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              active
                ? "bg-[#0bdbcf]/10 text-[#065f5a]"
                : "text-[#6b7280] hover:bg-[#f3f4f6]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
