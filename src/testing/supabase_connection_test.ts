import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = `https://hjrxyobgukrwrcaslhok.supabase.co`;
const SUPABASE_ANON_KEY = `sb_publishable_7n-tZgPz23ummy0jQmGB5A_Ie-PTQ08`;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("Testing Supabase connection...");

(async () => {
  try {
    // Query the `monitors` table to check connectivity
    const { data, error } = await supabase.from("monitors").select("*");

    if (error) {
      console.error("Supabase Error:", error);
    } else {
      console.log("Monitor Data:", data);
    }
  } catch (err) {
    console.error("Unexpected Error:", err);
  }
})();