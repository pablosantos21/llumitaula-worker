import { useState, useEffect, useRef, type SubmitEvent } from "react";
import type { PublicMonitor } from "../lib/deviceSetup";
import { supabase } from "../lib/supabase/client";

interface Props {
  monitor: PublicMonitor;
  onBack: () => void;
}

const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 5 * 60 * 1000;

const inputClassName =
  "h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-2xl tracking-[0.35em] text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

export default function MonitorPinInput({ monitor, onBack }: Props) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!locked) return;
    const timer = window.setTimeout(() => setLocked(false), COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [locked]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value.replace(/\D/g, "").slice(0, 6);
    setPin(value);
    setError(null);
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (loading || pin.length < 4 || locked) return;

    setLoading(true);
    setError(null);

    const email = monitor.login_email;
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email,
      password: pin,
    });

    if (signInError) {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setPin("");

      if (nextAttempts >= MAX_ATTEMPTS) {
        setLocked(true);
        setError(
          "Demasiados intentos. Espera 5 minutos antes de intentar de nuevo.",
        );
      } else {
        const remaining = MAX_ATTEMPTS - nextAttempts;
        setError(
          `PIN incorrecto. Te qued${remaining === 1 ? "a" : "an"} ${remaining} intento${remaining === 1 ? "" : "s"}.`,
        );
      }

      setLoading(false);
      inputRef.current?.focus();
      return;
    }

    window.location.assign("/");
  }

  return (
    <div className="flex flex-1 flex-col bg-white px-6 py-12">
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
              disabled={locked}
              placeholder="····"
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
