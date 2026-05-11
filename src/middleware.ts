import { defineMiddleware } from "astro:middleware";

// Routes that require authentication
const protectedRoutes = ["/", "/search"];

export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = context.url;
  const monitorId = context.cookies.get("monitor_id")?.value;

  // Check if the requested route requires authentication
  if (protectedRoutes.some((route) => pathname === route)) {
    if (!monitorId) {
      return context.redirect("/login");
    }
  }

  return next();
});
