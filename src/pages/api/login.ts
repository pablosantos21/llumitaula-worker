import type { APIRoute } from "astro";
import { authenticateMonitor } from "../../lib/supabase";

export const GET: APIRoute = async ({ url, cookies }) => {
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response(
      JSON.stringify({ error: "Código requerido" }),
      { status: 400 }
    );
  }

  const codeNum = parseInt(code, 10);
  if (isNaN(codeNum)) {
    return new Response(
      JSON.stringify({ error: "Código inválido" }),
      { status: 400 }
    );
  }

  const monitor = await authenticateMonitor(codeNum);

  if (!monitor) {
    return new Response(
      JSON.stringify({ error: "Código de monitor inválido" }),
      { status: 401 }
    );
  }

  // Set authentication cookie
  cookies.set("monitor_id", monitor.id, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    secure: import.meta.env.PROD,
    sameSite: "lax",
  });

  // Redirect to dashboard
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
    },
  });
};
