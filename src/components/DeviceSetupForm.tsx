import { useEffect, useState, type SubmitEvent } from "react";

import {
  assertDeviceStorageAvailable,
  getDeviceIdentifier,
  hasLinkedDevice,
  normalizeDeviceContext,
  saveDeviceContext,
} from "../lib/deviceSetup";
import { supabase } from "../lib/supabase/client";

const genericError =
  "No se ha podido vincular este dispositivo. Comprueba el código e inténtalo de nuevo.";
const inputClassName =
  "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-lg tracking-[0.35em] text-slate-900 uppercase outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

function isSuccessfulClaim(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { success?: unknown }).success === true &&
    typeof (value as { device_id?: unknown }).device_id === "string"
  );
}

export default function DeviceSetupForm() {
  const [code, setCode] = useState("");
  const [identifier, setIdentifier] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [setupState, setSetupState] = useState<"form" | "success">("form");

  useEffect(() => {
    try {
      if (hasLinkedDevice()) {
        window.location.assign("/workers");
        return;
      }
      const deviceIdentifier = getDeviceIdentifier();
      window.setTimeout(() => setIdentifier(deviceIdentifier), 0);
    } catch {
      window.setTimeout(
        () =>
          setError(
            "No se ha podido acceder al almacenamiento del dispositivo.",
          ),
        0,
      );
    }
  }, []);

  async function handleCodeSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !identifier) return;

    setSubmitting(true);
    setError(null);
    try {
      assertDeviceStorageAvailable();
      const { data: claimData, error: claimError } = await supabase.rpc(
        "claim_device",
        {
          p_code: code.trim(),
          p_device_identifier: identifier,
        },
      );
      if (claimError || !isSuccessfulClaim(claimData)) {
        setCode("");
        setError(genericError);
        return;
      }

      const { data: contextData, error: contextError } = await supabase.rpc(
        "get_device_monitors",
        { p_device_identifier: identifier },
      );
      const context = normalizeDeviceContext(contextData);
      if (contextError || !context) {
        setCode("");
        setError(genericError);
        return;
      }

      saveDeviceContext(context);
      setSchoolName(context.school_name);
      setSetupState("success");
    } catch {
      setCode("");
      setError(genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (setupState === "success") {
    return (
      <div className="space-y-6 text-center" role="status" aria-live="polite">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-600">
            Dispositivo vinculado
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-emerald-900">
            Vinculado a {schoolName ?? "tu colegio"}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => window.location.assign("/workers")}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-6 text-lg font-medium text-white transition-colors hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 focus:outline-none active:scale-[0.98]"
        >
          Continuar
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleCodeSubmit}>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="setup-code"
          className="ml-1 text-sm font-medium text-slate-700"
        >
          Código de configuración
        </label>
        <input
          id="setup-code"
          name="code"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          maxLength={8}
          minLength={6}
          pattern="[0-9A-Za-z]{6,8}"
          required
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setError(null);
          }}
          className={inputClassName}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !identifier}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-6 text-lg font-medium text-white transition-colors hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 focus:outline-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Vinculando..." : "Vincular dispositivo"}
      </button>
    </form>
  );
}
