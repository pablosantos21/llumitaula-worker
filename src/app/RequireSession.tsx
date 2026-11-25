import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router";

import {
  clearDeviceLink,
  getDeviceContext,
  hasLinkedDevice,
} from "../lib/deviceSetup";
import { supabase } from "../lib/supabase/client";

type GuardStatus = "checking" | "ok" | "missing" | "error";

const DEVICE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

function isDecommissionedDeviceResponse(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const response = value as { error?: unknown };
  return (
    response.error === "DEVICE_REVOKED" ||
    response.error === "DEVICE_INACTIVE" ||
    response.error === "DEVICE_NOT_FOUND"
  );
}

// Guardia única de sesión Supabase: valida la sesión remotamente con getUser(),
// escucha onAuthStateChange y comprueba revocación periódica del dispositivo.
// Sin sesión redirige a setup (o workers si el dispositivo está revocado/vinculado),
// ante fallo redirige a workers. Sin cookie legacy ni ruta de login antigua.
export default function RequireSession({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GuardStatus>("checking");

  useEffect(() => {
    let mounted = true;

    const verifyLinkedDevice = async (): Promise<boolean> => {
      const context = getDeviceContext();
      if (!context?.device_identifier) {
        return true;
      }

      try {
        const { data } = await supabase.rpc("get_device_monitors", {
          p_device_identifier: context.device_identifier,
        });
        if (!mounted) return false;

        if (isDecommissionedDeviceResponse(data)) {
          try {
            clearDeviceLink();
          } catch {
            // Proceed with sign-out even if storage is unavailable.
          }
          await supabase.auth.signOut().catch(() => undefined);
          if (mounted) setStatus("error");
          return false;
        }
      } catch {
        // Keep session active on transient offline/network errors.
      }

      return true;
    };

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;
        if (!session) {
          setStatus("missing");
          return;
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!mounted) return;
        if (userError || !user) {
          await supabase.auth.signOut().catch(() => undefined);
          if (mounted) {
            setStatus(hasLinkedDevice() ? "error" : "missing");
          }
          return;
        }

        const deviceValid = await verifyLinkedDevice();
        if (!mounted || !deviceValid) return;

        setStatus("ok");
      } catch {
        if (mounted) setStatus("error");
      }
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        setStatus(hasLinkedDevice() ? "error" : "missing");
      }
    });

    const intervalId = window.setInterval(() => {
      void verifyLinkedDevice();
    }, DEVICE_CHECK_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void verifyLinkedDevice();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (status === "checking") return null;
  if (status === "missing") return <Navigate to="/setup" replace />;
  if (status === "error") return <Navigate to="/workers" replace />;
  return <>{children}</>;
}
