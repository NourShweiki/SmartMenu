import type { Locale } from "@/interface/web/i18n/locales";

/**
 * Preview links (`/r/<slug>/<path>`, PROJECT_SPEC.md §5): which page of OUR site the link opens. Only the two kinds
 * of page a restaurant has: `/<ar|en>/...` (customer and staff pages) and `/t/<token>` (a table's QR code). Every
 * segment is plain letters, digits, `-` or `_` (ids, slugs, tokens), so no `..`, no `//other-site`, no encoded
 * tricks: the redirect can never leave this site (no open redirect). Null = refuse (404).
 */
const SEGMENT = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_SEGMENTS = 8;

export function previewTarget(rest: readonly string[] | undefined, defaultLanguage: Locale): string | null {
  const parts = rest ?? [];
  if (parts.length === 0) return `/${defaultLanguage}`;
  if (parts.length > MAX_SEGMENTS) return null;
  if (parts[0] !== "ar" && parts[0] !== "en" && parts[0] !== "t") return null;
  if (!parts.every((p) => SEGMENT.test(p))) return null;
  return `/${parts.join("/")}`;
}

/** The preview cookie: server-only (HttpOnly), not sent cross-site (Lax), Secure on https, as long as a visit lasts. */
export const PREVIEW_MAX_AGE_SECONDS = 12 * 60 * 60;
export const previewCookieOptions = (secure: boolean) =>
  ({ httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: PREVIEW_MAX_AGE_SECONDS }) as const;
