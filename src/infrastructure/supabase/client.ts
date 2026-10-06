import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example)");
  }
  return { url, key };
}

/**
 * Low-privilege client (publishable key). It can only do what RLS and the public
 * functions allow, so it is safe on the server and later in the browser.
 */
export function createPublicClient(): SupabaseClient {
  const { url, key } = supabaseEnv();
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Same publishable key, but acting as the signed-in staff user (session in cookies),
 * so RLS applies as that user. For Server Components, Server Actions and Route Handlers.
 */
export async function createSessionClient(): Promise<SupabaseClient> {
  const { url, key } = supabaseEnv();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; the middleware refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Middleware: refresh an expiring session. The refreshed cookies must reach BOTH the page
 * render (request) and the browser (response); otherwise the page retries the refresh with
 * an already-used refresh token and Supabase signs the user out.
 */
export async function refreshSessionCookies(request: NextRequest): Promise<NextResponse> {
  const { url, key } = supabaseEnv();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request }); // rebuild so the forwarded request has the new cookies
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getUser() validates the token with Supabase Auth and triggers the refresh if needed.
  await supabase.auth.getUser();
  return response;
}
