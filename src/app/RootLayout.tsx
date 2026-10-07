import { useEffect } from "react";
import { NavLink, Outlet } from "react-router";

const baseTab =
  "flex-1 rounded-xl px-4 py-2 text-sm font-bold text-center transition-colors";
const activeTab = "bg-emerald-600 text-white shadow-sm";
const inactiveTab = "text-slate-600 hover:bg-slate-100";

// Shell principal: navegación única en React con el mismo head PWA de
// index.html y registro diferido del service worker.
export default function RootLayout() {
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

  return (
    <>
      <header className="sticky top-0 z-10 bg-white/95 px-4 pt-4 backdrop-blur">
        <nav
          aria-label="Secciones principales"
          className="flex gap-1 rounded-2xl bg-slate-100 p-1"
        >
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `${baseTab} ${isActive ? activeTab : inactiveTab}`
            }
          >
            Clases
          </NavLink>
          <NavLink
            to="/incidencias"
            className={({ isActive }) =>
              `${baseTab} ${isActive ? activeTab : inactiveTab}`
            }
          >
            Incidencias
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </>
  );
}
