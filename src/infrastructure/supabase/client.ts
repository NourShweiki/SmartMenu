import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/**
 * DEBUG_SUPABASE=1 logs every Supabase HTTP call with its duration (local profiling only).
 * Off by default; never enable it in production logs (URLs can contain ids).
 */
const timedFetch: typeof fetch = async (input, init) => {
  const started = performance.now();
  const response = await fetch(input, init);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  console.log(`[supabase] ${init?.method ?? "GET"} ${url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]} ${Math.round(performance.now() - started)}ms`);
  return response;
};
const globalFetch = () => (process.env.DEBUG_SUPABASE === "1" ? { global: { fetch: timedFetch } } : {});

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
  return createClient(url, key, { auth: { persistSession: false }, ...globalFetch() });
}

/**
 * SERVER-ONLY client with the service-role (secret) key: it bypasses RLS. Use it only for the few operations
 * that have no signed-in user yet (customers have no accounts): handing out order numbers, placing an order,
 * reading the live menu to build one. Every caller must scope by a restaurantId resolved from the host.
 * Never import this from a Client Component, and never prefix the variable with NEXT_PUBLIC_.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (see .env.example)");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, ...globalFetch() });
}

/**
 * Same publishable key, but acting as the signed-in staff user (session in cookies),
 * so RLS applies as that user. For Server Components, Server Actions and Route Handlers.
 */
export async function createSessionClient(): Promise<SupabaseClient> {
  const { url, key } = supabaseEnv();
  const store = await cookies();
  return createServerClient(url, key, {
    ...globalFetch(),
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
    ...globalFetch(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request }); // rebuild so the forwarded request has the new cookies
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getClaims() refreshes an expiring session and verifies the token LOCALLY against the
  // cached signing keys (ES256) — no round trip to Supabase Auth on every request.
  await supabase.auth.getClaims();
  return response;
}
