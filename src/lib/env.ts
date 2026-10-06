import { z } from "zod";

const envSchema = z.object({
  PUBLIC_SUPABASE_URL: z.string().min(1, "PUBLIC_SUPABASE_URL is required"),
  PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "PUBLIC_SUPABASE_ANON_KEY is required"),
});

export const env = envSchema.parse(import.meta.env);
