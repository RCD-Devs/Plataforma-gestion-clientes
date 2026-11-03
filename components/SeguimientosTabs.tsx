import Link from "next/link";

// Pestañas de /seguimientos: los acuerdos (seguimientos) y la planificación
// de dailys por equipo.
export function SeguimientosTabs({ active }: { active: "seguimientos" | "dailys" }) {
  const tabs = [
    { key: "seguimientos", label: "Seguimientos", href: "/seguimientos" },
    { key: "dailys", label: "Dailys por equipo", href: "/seguimientos/dailys" },
  ] as const;
  return (
    <nav aria-label="Secciones" className="flex gap-6 border-b border-[#e4e8ec] bg-white px-6">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={`-mb-px border-b-2 py-2.5 text-sm font-semibold transition ${
            active === t.key ? "border-[#0bdbcf] text-[#081826]" : "border-transparent text-[#5d6b77] hover:text-[#081826]"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
