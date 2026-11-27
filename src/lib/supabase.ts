import { createClient } from "@supabase/supabase-js";

// Public project values (safe in the browser — every table is protected by row-level security).
// Environment variables override them, e.g. to point a deployment at a different project.
const DEFAULT_URL = "https://rqrxwqlolgkrlktybxma.supabase.co";
const DEFAULT_KEY = "sb_publishable_Iz8R-d2o-W4fspDd87WTCA_gXBhJ5sF";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
