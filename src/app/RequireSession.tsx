import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router";

import { supabase } from "../lib/supabase/client";

type GuardStatus = "checking" | "ok" | "missing" | "error";

// Guardia única de sesión Supabase: sin sesión redirige a setup, ante un
// fallo de lectura redirige a workers. Sin cookie legacy ni ruta de login
// antigua.
export default function RequireSession({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GuardStatus>("checking");

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;
        setStatus(session ? "ok" : "missing");
      } catch {
        if (mounted) setStatus("error");
      }
    };

    void checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  if (status === "checking") return null;
  if (status === "missing") return <Navigate to="/setup" replace />;
  if (status === "error") return <Navigate to="/workers" replace />;
  return <>{children}</>;
}
