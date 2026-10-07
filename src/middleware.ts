import { defineMiddleware } from "astro:middleware";

const protectedRoutes = ["/classes", "/incidencias", "/search"];

// Rutas que ya se protegen solas con Supabase (AuthGuard en MainLayout +
// lógica de sesión en el componente React) y no usan la cookie legacy
// `monitor_id`. El gate legacy las redirigiría a /login, página que no
// existe, devolviendo un 404 a usuarios con sesión válida.
const supabaseGuardedRoutes = ["/incidencias/notificar"];

export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = context.url;

  if (
    supabaseGuardedRoutes.some(
      (route) => pathname === route || pathname === route + "/",
    )
  ) {
    return next();
  }

  const monitorId = context.cookies.get("monitor_id")?.value;

  if (protectedRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"))) {
    if (!monitorId) {
      // /setup es la puerta de entrada real (vinculación + Supabase);
      // la antigua /login ya no existe como página y devolvía 404.
      return context.redirect("/setup");
    }
  }

  return next();
});
