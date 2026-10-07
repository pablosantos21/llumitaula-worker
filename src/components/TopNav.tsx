type TopNavTab = "clases" | "incidencias";

export default function TopNav({ active }: { active: TopNavTab }) {
  const base =
    "flex-1 rounded-xl px-4 py-2 text-sm font-bold text-center transition-colors";
  const activeClass = "bg-emerald-600 text-white shadow-sm";
  const inactiveClass = "text-slate-600 hover:bg-slate-100";

  return (
    <nav
      aria-label="Secciones principales"
      className="flex gap-1 rounded-2xl bg-slate-100 p-1"
    >
      <a
        href="/"
        aria-current={active === "clases" ? "page" : undefined}
        className={`${base} ${active === "clases" ? activeClass : inactiveClass}`}
      >
        Clases
      </a>
      <a
        href="/incidencias/notificar"
        aria-current={active === "incidencias" ? "page" : undefined}
        className={`${base} ${active === "incidencias" ? activeClass : inactiveClass}`}
      >
        Incidencias
      </a>
    </nav>
  );
}
