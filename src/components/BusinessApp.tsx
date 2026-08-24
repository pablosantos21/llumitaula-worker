import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase/client";
import type { Database } from "../types/database";

type Child = Database["public"]["Tables"]["children"]["Row"];
type Page = "home" | "search";

export default function BusinessApp({ page }: { page: Page }) {
  const [children, setChildren] = useState<Child[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    "loading" | "signed-out" | "ready" | "error"
  >("loading");

  useEffect(() => {
    let active = true;

    async function loadChildren() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!active) return;
      if (!sessionData.session) {
        setState("signed-out");
        return;
      }

      const { data, error } = await supabase
        .from("children")
        .select("id, first_name, last_name, class_id, created_at")
        .order("last_name");
      if (!active) return;
      if (error) {
        setState("error");
        return;
      }

      setChildren(data ?? []);
      setState("ready");
    }

    void loadChildren();
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading")
    return (
      <p className="p-6 text-sm text-slate-500">
        Cargando datos autorizados...
      </p>
    );
  if (state === "signed-out") {
    return (
      <section className="m-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Sesión no iniciada</h1>
        <p className="mt-2 text-sm text-slate-500">
          Inicia sesión para consultar los alumnos autorizados.
        </p>
        <a
          className="mt-4 inline-flex rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white"
          href="/login"
        >
          Ir al login
        </a>
      </section>
    );
  }

  const visibleChildren = children.filter((child) => {
    const name = `${child.first_name} ${child.last_name}`.toLowerCase();
    return page === "search" ? name.includes(query.toLowerCase()) : true;
  });

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md">
        <div>
          <h1 className="text-lg font-bold leading-none text-slate-900">
            {page === "search" ? "Buscar Alumno" : "Mi Clase"}
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Datos visibles según los permisos de tu cuenta
          </p>
        </div>
        <a
          className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600"
          href={page === "search" ? "/" : "/search"}
        >
          {page === "search" ? "Volver" : "Buscar"}
        </a>
      </header>

      {page === "search" && (
        <div className="px-4 pt-4">
          <label className="sr-only" htmlFor="student-search">
            Buscar alumno
          </label>
          <input
            id="student-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar alumno..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100/50 px-4 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 p-4 pb-24 md:grid-cols-2 lg:grid-cols-3">
        {visibleChildren.map((child) => (
          <article
            key={child.id}
            className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
          >
            <h2 className="font-bold leading-tight text-slate-900">
              {child.first_name} {child.last_name}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Sin registros de comida todavía
            </p>
          </article>
        ))}
      </div>
      {(state === "error" || visibleChildren.length === 0) && (
        <p className="px-4 pb-6 text-sm text-slate-500">
          {state === "error"
            ? "No se han podido cargar los datos autorizados."
            : "No hay alumnos disponibles para esta cuenta."}
        </p>
      )}
    </>
  );
}
