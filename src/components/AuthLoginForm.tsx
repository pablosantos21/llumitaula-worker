import { useState, type SubmitEvent } from "react";

import { supabase } from "../lib/supabase/client";

const inputClassName =
  "h-12 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all";

export default function AuthLoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    if (loading) return;

    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError("El correo electrónico o la contraseña no son válidos.");
        setLoading(false);
        return;
      }
    } catch {
      setError("El correo electrónico o la contraseña no son válidos.");
      setLoading(false);
      return;
    }

    window.location.assign("/");
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-sm font-medium text-slate-700 ml-1"
        >
          Correo electrónico
        </label>
        <input
          type="email"
          name="email"
          id="email"
          autoComplete="username"
          placeholder="nombre@ejemplo.com"
          required
          className={inputClassName}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-slate-700 ml-1"
        >
          Contraseña
        </label>
        <input
          type="password"
          name="password"
          id="password"
          autoComplete="current-password"
          required
          className={inputClassName}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed h-12 px-6 rounded-xl text-lg active:scale-[0.98] bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500 w-full"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </form>
  );
}
