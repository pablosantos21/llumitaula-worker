import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ cookies }) => {
  cookies.delete("monitor_id", {
    path: "/",
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
    },
  });
};
