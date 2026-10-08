import { z } from "zod";

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().min(1, "VITE_SUPABASE_URL is required"),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "VITE_SUPABASE_ANON_KEY is required"),
});

const viteEnv = import.meta.env as Record<string, string | undefined>;

// Corte #48: solo prefijo Vite, sin fallback legacy ni service_role en cliente.
const raw = {
  VITE_SUPABASE_URL: viteEnv.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: viteEnv.VITE_SUPABASE_ANON_KEY,
};

export const env = envSchema.parse(raw);
