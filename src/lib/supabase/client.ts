import { createClient } from "@supabase/supabase-js";

import { env } from "../env";
import type { Database } from "../../types/database";

export const supabase = createClient<Database>(
  env.PUBLIC_SUPABASE_URL,
  env.PUBLIC_SUPABASE_ANON_KEY,
);
