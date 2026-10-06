import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Low-privilege client (publishable key). It can only do what RLS and the public
 * functions allow, so it is safe on the server and later in the browser.
 */
export function createPublicClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example)");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
