import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ cookies }) => {
  // Clear authentication cookie
  cookies.delete("monitor_id", {
    path: "/",
  });

  // Redirect to login
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/login",
    },
  });
};
