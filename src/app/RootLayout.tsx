import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { supabase } from "../lib/supabase/client";

const PUBLIC_PREFIXES = ["/setup", "/workers"];

function tabClass({ isActive }: { isActive: boolean }): string {
  const base =
    "flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-2 text-center text-base font-bold leading-tight transition-colors touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2";
  return isActive
    ? `${base} bg-emerald-600 text-white shadow-md`
    : `${base} bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50`;
}

// Shell principal: una sola navegación inferior con objetivos táctiles
// grandes para tablet (mínimo 64px de alto, texto base). Hoy es la landing
// tras el login; Clases e Incidencias son hermanas. La salida de sesión vive
// en la propia navegación inferior para estar accesible desde cualquier
// página protegida, no solo desde Clases. En las rutas públicas de
// vinculación y login (/setup, /workers) no se muestra el menú: allí no hay
// sesión que cerrar.
// Mantiene el mismo head PWA de index.html y registro diferido del service
// worker.
export default function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const showNav = !PUBLIC_PREFIXES.some((prefix) =>
    location.pathname.startsWith(prefix),
  );

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .catch((error) => {
            console.warn("Service worker registration failed", error);
          });
      });
    }
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/workers", { replace: true });
  }

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-white focus:px-4 focus:py-3 focus:text-base focus:font-bold focus:text-emerald-800 focus:shadow-lg"
      >
        Saltar al contenido
      </a>
      <main id="contenido" className="flex flex-1 flex-col pb-28">
        <Outlet />
      </main>
      {showNav && (
        <nav
          aria-label="Secciones principales"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        >
          <ul className="mx-auto grid w-full max-w-3xl grid-cols-4 gap-2 px-4 pb-3 pt-2">
            <li>
              <NavLink
                to="/"
                end
                aria-label="Hoy: previsión de hoy"
                className={tabClass}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="h-6 w-6"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
                <span>Hoy</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/clases"
                aria-label="Clases: pasar lista y comedor"
                className={tabClass}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="h-6 w-6"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>Clases</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/incidencias"
                aria-label="Incidencias: notificar y revisar"
                className={tabClass}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="h-6 w-6"
                >
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <path d="M12 9v4m0 4h.01" />
                </svg>
                <span>Incidencias</span>
              </NavLink>
            </li>
            <li>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                aria-label="Salir de la sesión"
                className="flex min-h-[64px] w-full flex-col items-center justify-center gap-0.5 rounded-2xl bg-white px-2 py-2 text-center text-base font-bold leading-tight text-slate-700 ring-1 ring-slate-200 transition-colors touch-manipulation hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="h-6 w-6"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="m16 17 5-5-5-5M21 12H9" />
                </svg>
                <span>Salir</span>
              </button>
            </li>
          </ul>
        </nav>
      )}
    </>
  );
}
