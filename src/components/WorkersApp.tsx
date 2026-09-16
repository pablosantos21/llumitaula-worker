import { useCallback, useEffect, useState } from "react";

import {
  clearDeviceLink,
  getDeviceContext,
  getDeviceIdentifier,
  normalizeDeviceContext,
  saveDeviceContext,
  type LinkedDeviceContext,
  type PublicMonitor,
} from "../lib/deviceSetup";
import { supabase } from "../lib/supabase/client";
import MonitorPinInput from "./MonitorPinInput";
import MonitorSelectScreen from "./MonitorSelectScreen";

type Status =
  "loading" | "ready" | "empty" | "error" | "decommissioned" | "unavailable";

type DeviceResponseKind = "decommissioned" | "unavailable";

type FreshMonitors =
  | { kind: "fresh"; context: LinkedDeviceContext }
  | { kind: "decommissioned" }
  | { kind: "unavailable" }
  | null;

function classifyDeviceResponse(value: unknown): DeviceResponseKind | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const response = value as { error?: unknown; success?: unknown };
  if (
    response.error === "DEVICE_INACTIVE" ||
    response.error === "DEVICE_REVOKED"
  ) {
    return "decommissioned";
  }
  return response.success === false ? "unavailable" : null;
}

async function requestFreshMonitors(): Promise<FreshMonitors> {
  const cached = getDeviceContext();
  if (!cached) {
    throw new Error("not-linked");
  }
  if (!cached.device_identifier) {
    throw new Error("not-linked");
  }
  const { data, error: rpcError } = await supabase.rpc("get_device_monitors", {
    p_device_identifier: cached.device_identifier,
  });
  if (rpcError) return null;
  const responseKind = classifyDeviceResponse(data);
  if (responseKind) return { kind: responseKind };
  const context = normalizeDeviceContext(data);
  return context ? { kind: "fresh", context } : null;
}

export default function WorkersApp() {
  const [status, setStatus] = useState<Status>("loading");
  const [monitors, setMonitors] = useState<PublicMonitor[]>([]);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedMonitor, setSelectedMonitor] = useState<PublicMonitor | null>(
    null,
  );

  const applyFreshContext = useCallback((context: LinkedDeviceContext) => {
    saveDeviceContext(context);
    setMonitors(context.monitors);
    setSchoolName(context.school_name);
    setStatus(context.monitors.length > 0 ? "ready" : "empty");
  }, []);

  useEffect(() => {
    let cancelled = false;

    try {
      getDeviceIdentifier();
    } catch {
      window.setTimeout(() => {
        if (!cancelled) setStatus("error");
      }, 0);
      return () => {
        cancelled = true;
      };
    }

    const cached = getDeviceContext();
    if (!cached) {
      window.location.assign("/setup");
      return () => {
        cancelled = true;
      };
    }

    void requestFreshMonitors().then(
      (fresh) => {
        if (cancelled) return;
        if (!fresh) {
          if (cached.monitors.length > 0) {
            setMonitors(cached.monitors);
            setSchoolName(cached.school_name);
            setStatus("ready");
            setNotice(
              "No se ha podido actualizar la lista. Mostrando los monitores guardados.",
            );
          } else {
            setStatus("error");
          }
          return;
        }
        if (fresh.kind === "decommissioned") {
          try {
            clearDeviceLink();
          } catch {
            // The server response still controls the current screen.
          }
          setSelectedMonitor(null);
          setStatus("decommissioned");
          return;
        }
        if (fresh.kind === "unavailable") {
          try {
            clearDeviceLink();
          } catch {
            // The server response still controls the current screen.
          }
          setStatus("unavailable");
          return;
        }
        applyFreshContext(fresh.context);
      },
      () => {
        if (cancelled) return;
        if (cached.monitors.length > 0) {
          setMonitors(cached.monitors);
          setSchoolName(cached.school_name);
          setStatus("ready");
          setNotice(
            "No se ha podido actualizar la lista. Mostrando los monitores guardados.",
          );
        } else {
          setStatus("error");
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [applyFreshContext]);

  async function handleRefresh() {
    const cached = getDeviceContext();
    if (!cached) {
      window.location.assign("/setup");
      return;
    }
    setRefreshing(true);
    setNotice(null);
    try {
      const fresh = await requestFreshMonitors();
      if (!fresh) {
        if (cached.monitors.length > 0) {
          setMonitors(cached.monitors);
          setSchoolName(cached.school_name);
          setStatus("ready");
          setNotice(
            "No se ha podido actualizar la lista. Mostrando los monitores guardados.",
          );
        } else {
          setStatus("error");
        }
        return;
      }
      if (fresh.kind === "decommissioned") {
        try {
          clearDeviceLink();
        } catch {
          // The server response still controls the current screen.
        }
        setMonitors([]);
        setSchoolName(null);
        setSelectedMonitor(null);
        setStatus("decommissioned");
        return;
      }
      if (fresh.kind === "unavailable") {
        try {
          clearDeviceLink();
        } catch {
          // The server response still controls the current screen.
        }
        setMonitors([]);
        setSchoolName(null);
        setStatus("unavailable");
        return;
      }
      applyFreshContext(fresh.context);
    } catch {
      if (cached.monitors.length > 0) {
        setMonitors(cached.monitors);
        setSchoolName(cached.school_name);
        setStatus("ready");
        setNotice(
          "No se ha podido actualizar la lista. Mostrando los monitores guardados.",
        );
      } else {
        setStatus("error");
      }
    } finally {
      setRefreshing(false);
    }
  }

  function handleUnlink() {
    try {
      clearDeviceLink();
    } catch {
      setNotice("No se ha podido acceder al almacenamiento del dispositivo.");
      return;
    }
    window.location.assign("/setup");
  }

  if (status === "loading") {
    return (
      <p className="px-6 py-12 text-center text-sm text-slate-500">
        Cargando monitores...
      </p>
    );
  }

  if (status === "decommissioned") {
    return (
      <div className="mx-auto w-full max-w-sm space-y-4 px-6 py-12 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-emerald-900">
          Dispositivo dado de baja
        </h1>
        <p className="text-sm text-slate-500">
          Este dispositivo ha sido dado de baja. Contacta con la administración
          para volver a activarlo.
        </p>
        <button
          type="button"
          onClick={handleUnlink}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-lg font-medium text-slate-700"
        >
          Usar otro código
        </button>
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className="mx-auto w-full max-w-sm space-y-4 px-6 py-12 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-emerald-900">
          Dispositivo no disponible
        </h1>
        <p className="text-sm text-slate-500">
          No se ha podido verificar este dispositivo. Vuelve a vincularlo con
          otro código.
        </p>
        <button
          type="button"
          onClick={handleUnlink}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-lg font-medium text-slate-700"
        >
          Usar otro código
        </button>
      </div>
    );
  }

  if (selectedMonitor) {
    return (
      <MonitorPinInput
        monitor={selectedMonitor}
        onBack={() => setSelectedMonitor(null)}
      />
    );
  }

  if (status === "error" && monitors.length === 0) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-4 px-6 py-12 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-emerald-900">
          No se han podido cargar los monitores
        </h1>
        <p className="text-sm text-slate-500">
          Comprueba la conexión e inténtalo de nuevo.
        </p>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-6 text-lg font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? "Recargando..." : "Reintentar"}
          </button>
          <button
            type="button"
            onClick={handleUnlink}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-lg font-medium text-slate-700"
          >
            Usar otro código
          </button>
        </div>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="mx-auto w-full max-w-sm space-y-4 px-6 py-12 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-emerald-900">
          Sin monitores
        </h1>
        <p className="text-sm text-slate-500">
          Todavía no hay monitores vinculados a este centro.
        </p>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-6 text-lg font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? "Recargando..." : "Recargar lista"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {schoolName && (
        <p className="px-6 pt-6 text-center text-sm font-medium text-slate-500">
          {schoolName}
        </p>
      )}
      {notice && (
        <p
          className="mx-6 mt-4 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-800"
          role="alert"
        >
          {notice}
        </p>
      )}
      <div className="flex items-center justify-center gap-3 px-6 pt-4">
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="text-sm font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
        >
          {refreshing ? "Recargando..." : "Recargar lista"}
        </button>
        <span className="text-slate-300">·</span>
        <button
          type="button"
          onClick={handleUnlink}
          className="text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          Usar otro código
        </button>
      </div>
      <MonitorSelectScreen monitors={monitors} onSelect={setSelectedMonitor} />
    </div>
  );
}
