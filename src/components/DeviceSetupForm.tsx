import { useEffect, useState, type SubmitEvent } from "react";

import {
  getDeviceIdentifier,
  saveDeviceContext,
  type DeviceContext,
} from "../lib/deviceSetup";
import { supabase } from "../lib/supabase/client";
import type { Json } from "../types/database";

const genericError =
  "No se ha podido vincular este dispositivo. Comprueba el código e inténtalo de nuevo.";
const inputClassName =
  "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-lg tracking-[0.35em] text-slate-900 uppercase outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

function isDeviceContext(value: Json): value is DeviceContext & { ok: true } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, Json | undefined>;
  return (
    candidate.ok === true &&
    typeof candidate.device_id === "string" &&
    typeof candidate.device_identifier === "string" &&
    typeof candidate.school_id === "string" &&
    (typeof candidate.school_name === "string" ||
      candidate.school_name === null) &&
    Array.isArray(candidate.workers) &&
    candidate.workers.every(
      (worker) =>
        typeof worker === "object" &&
        worker !== null &&
        !Array.isArray(worker) &&
        typeof worker.id === "string" &&
        (typeof worker.full_name === "string" || worker.full_name === null),
    )
  );
}

export default function DeviceSetupForm() {
  const [code, setCode] = useState("");
  const [identifier, setIdentifier] = useState<string | null>(null);
  const [state, setState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");

  useEffect(() => {
    try {
      const deviceIdentifier = getDeviceIdentifier();
      window.setTimeout(() => setIdentifier(deviceIdentifier), 0);
    } catch {
      window.setTimeout(() => setState("error"), 0);
    }
  }, []);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting" || !identifier) {
      return;
    }

    setState("submitting");
    try {
      // prettier-ignore
      const { data, error } = await supabase.rpc("claim_device_setup", {
        p_code: code.trim(), p_device_identifier: identifier });
      if (error || !data || !isDeviceContext(data)) {
        setCode("");
        setState("error");
        return;
      }

      saveDeviceContext(data);
      setState("success");
      window.location.assign("/app/workers");
    } catch {
      setCode("");
      setState("error");
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
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
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          minLength={6}
          pattern="[0-9A-Za-z]{6}"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className={inputClassName}
        />
      </div>

      {state === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {genericError}
        </p>
      )}
      {state === "success" && (
        <p className="text-sm text-emerald-700" role="status">
          Dispositivo vinculado correctamente.
        </p>
      )}

      <button
        type="submit"
        disabled={state === "submitting" || !identifier}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-6 text-lg font-medium text-white transition-colors hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 focus:outline-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === "submitting" ? "Vinculando..." : "Vincular dispositivo"}
      </button>
    </form>
  );
}
