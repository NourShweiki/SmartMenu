import { headers } from "next/headers";

/**
 * The address people actually typed or scanned, e.g. "http://demo-dinein.localhost:3000" or "https://grill.ourapp.com".
 * Behind Vercel / a proxy the original host and protocol come in `x-forwarded-*` (the same header
 * getCurrentSite reads); on localhost the protocol is plain http.
 */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "localhost:3000";
  const forwardedProto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)|\.localhost(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * The link inside a table's QR code. It carries ONLY the random token: the table number is not in it, so renaming
 * or renumbering a table never invalidates a printed code, and one code reveals nothing about any other. No language
 * in the path either: `/t/<token>` redirects to the restaurant's default language, so the printed code stays stable.
 */
export const tableScanUrl = (origin: string, token: string): string => `${origin}/t/${token}`;
