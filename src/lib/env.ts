import { z } from "zod";

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().min(1, "VITE_SUPABASE_URL is required"),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "VITE_SUPABASE_ANON_KEY is required"),
});

const viteEnv = import.meta.env as Record<string, string | undefined>;

// Transición #42→#48: Astro expone el prefijo PUBLIC_* mientras Vite expone
// VITE_*. El esquema valida bajo prefijo Vite y nunca acepta service_role
// en cliente; el fallback legacy se elimina en #48.
const raw = {
  VITE_SUPABASE_URL: viteEnv.VITE_SUPABASE_URL ?? viteEnv.PUBLIC_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY:
    viteEnv.VITE_SUPABASE_ANON_KEY ?? viteEnv.PUBLIC_SUPABASE_ANON_KEY,
};

export const env = envSchema.parse(raw);
