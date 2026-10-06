import { defineMiddleware } from "astro:middleware";

const protectedRoutes = ["/classes", "/incidencias", "/search"];

export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = context.url;
  const monitorId = context.cookies.get("monitor_id")?.value;

  if (protectedRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"))) {
    if (!monitorId) {
      return context.redirect("/login?redirect=" + encodeURIComponent(pathname));
    }
  }

  return next();
});
