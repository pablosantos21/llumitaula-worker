import { useState, useEffect, useRef, type SubmitEvent } from "react";
import { getDeviceIdentifier, type PublicMonitor } from "../lib/deviceSetup";
import { supabase } from "../lib/supabase/client";

interface Props {
  monitor: PublicMonitor;
  deviceIdentifier?: string;
  onBack: () => void;
  onSuccess: () => void;
}

interface PinCheckResponse {
  allowed?: boolean;
  locked?: boolean;
  remaining_attempts?: number;
  retry_after_seconds?: number;
}

export const MAX_ATTEMPTS = 5;
export const COOLDOWN_MS = 5 * 60 * 1000;

const inputClassName =
  "h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-2xl tracking-[0.35em] text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

function parsePinCheckResponse(value: unknown): PinCheckResponse | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as PinCheckResponse;
}

export default function MonitorPinInput({
  monitor,
  deviceIdentifier,
  onBack,
  onSuccess,
}: Props) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(COOLDOWN_MS);
  const inputRef = useRef<HTMLInputElement>(null);

  // Aislamiento por monitor: el contenedor renderiza con key={monitor.id} y
  // el servidor persiste los intentos/bloqueo por (device_identifier, monitor.id).

  function resolveDeviceIdentifier(): string {
    if (deviceIdentifier) return deviceIdentifier;
    try {
      return getDeviceIdentifier();
    } catch {
      return "";
    }
  }

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    const identifier =
      deviceIdentifier ??
      (() => {
        try {
          return getDeviceIdentifier();
        } catch {
          return "";
        }
      })();
    if (!identifier) return;

    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc(
          "get_monitor_pin_lockout",
          {
            p_device_identifier: identifier,
            p_monitor_id: monitor.id,
          },
        );
        if (!active || rpcError) return;
        const status = parsePinCheckResponse(data);
        if (!status) return;

        if (status.locked) {
          const retryMs = Math.max(
            1000,
            (status.retry_after_seconds ?? 300) * 1000,
          );
          setAttempts(MAX_ATTEMPTS);
          setCooldownMs(retryMs);
          setLocked(true);
          setError(
            "Demasiados intentos. Espera 5 minutos antes de intentar de nuevo.",
          );
        } else if (typeof status.remaining_attempts === "number") {
          setAttempts(Math.max(0, MAX_ATTEMPTS - status.remaining_attempts));
        }
      } catch {
        // Keep interactive form ready if lockout check cannot reach network.
      }
    })();

    return () => {
      active = false;
    };
  }, [deviceIdentifier, monitor.id]);

  useEffect(() => {
    if (!locked) return;
    const timer = window.setTimeout(() => {
      setLocked(false);
      setAttempts(0);
      setCooldownMs(COOLDOWN_MS);
      setError(null);
    }, cooldownMs);
    return () => clearTimeout(timer);
  }, [locked, cooldownMs]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value.replace(/\D/g, "").slice(0, 6);
    setPin(value);
    setError(null);
  }

  function registerFailedAttempt(
    serverRemaining?: number,
    serverLocked?: boolean,
    retryAfterSeconds?: number,
  ) {
    const nextAttempts =
      typeof serverRemaining === "number"
        ? Math.max(0, MAX_ATTEMPTS - serverRemaining)
        : attempts + 1;
    const isNowLocked = Boolean(serverLocked) || nextAttempts >= MAX_ATTEMPTS;

    setAttempts(nextAttempts);
    setPin("");

    if (isNowLocked) {
      setCooldownMs(
        retryAfterSeconds && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : COOLDOWN_MS,
      );
      setLocked(true);
      setError(
        "Demasiados intentos. Espera 5 minutos antes de intentar de nuevo.",
      );
    } else {
      const remaining =
        typeof serverRemaining === "number"
          ? serverRemaining
          : MAX_ATTEMPTS - nextAttempts;
      setError(
        `PIN incorrecto. Te qued${remaining === 1 ? "a" : "an"} ${remaining} intento${remaining === 1 ? "" : "s"}.`,
      );
    }

    inputRef.current?.focus();
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (loading || pin.length < 4 || locked) return;

    setLoading(true);
    setError(null);

    try {
      const identifier = resolveDeviceIdentifier();
      if (identifier) {
        const { data: verifyData, error: verifyError } = await supabase.rpc(
          "verify_monitor_pin",
          {
            p_device_identifier: identifier,
            p_monitor_id: monitor.id,
            p_pin: pin,
          },
        );

        if (verifyError) {
          setError("Error de conexión. Comprueba tu red e inténtalo de nuevo.");
          return;
        }

        const verification = parsePinCheckResponse(verifyData);
        if (!verification?.allowed) {
          registerFailedAttempt(
            verification?.remaining_attempts,
            verification?.locked,
            verification?.retry_after_seconds,
          );
          return;
        }
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: monitor.login_email,
        password: pin,
      });

      if (signInError) {
        registerFailedAttempt();
        return;
      }

      // La sesión Supabase queda mantenida por signInWithPassword; el destino
      // (raíz protegida) lo decide el contenedor vía onSuccess, sin recargas.
      onSuccess();
    } catch {
      setError("Error de conexión. Comprueba tu red e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex flex-1 flex-col bg-white px-6 py-12"
      data-monitor-id={monitor.id}
    >
      <div className="mx-auto w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <button
            type="button"
            onClick={onBack}
            className="mb-4 text-sm text-slate-500 hover:text-slate-700"
          >
            ← Volver
          </button>
          <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-xl font-bold text-emerald-600">
            {monitor.first_name[0]}
            {monitor.last_name[0]}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {monitor.first_name} {monitor.last_name}
          </h1>
          <p className="text-slate-500">Introduce tu PIN para acceder</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="monitor-pin" className="sr-only">
              PIN
            </label>
            <input
              ref={inputRef}
              id="monitor-pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              minLength={4}
              required
              value={pin}
              onChange={handleChange}
              disabled={locked || loading}
              placeholder="······"
              className={inputClassName}
            />
          </div>

          {error && (
            <p className="text-center text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || pin.length < 4 || locked}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-6 text-lg font-medium text-white transition-colors hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 focus:outline-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
