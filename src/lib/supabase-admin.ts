import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseAdmin: ReturnType<typeof createClient<Database>> | null = null;

if (SUPABASE_URL && SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);
}

export { supabaseAdmin };
