import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { PublicRestaurant } from "@/application/ports/restaurant-repository";
import { slugFromHost } from "@/domain/restaurant/host";
import { resolveSiteSlug } from "@/domain/restaurant/site";
import { appRootDomain, getPublicRestaurant, previewLinksEnabled } from "@/infrastructure/container";

export type Site =
  | { kind: "platform" } // the bare root domain (no restaurant)
  | { kind: "restaurant"; restaurant: PublicRestaurant; viaPreview?: true } // viaPreview: chosen by a preview link
  | { kind: "unknown" }; // a subdomain no restaurant owns

/** The cookie a preview link (`/r/<slug>`) sets: which restaurant the bare root address shows. */
export const PREVIEW_COOKIE = "smartmenu_preview_site";

/**
 * The host the visitor typed. Prefer `x-forwarded-host`: Next.js sets it from the original
 * Host on every request, and it survives the internal re-fetch Next does to render a page
 * after a Server Action redirect (whose own Host is the server's origin, e.g. "localhost:3000").
 * Vercel sets it too. Both headers are client-controlled, which is fine: the host only picks
 * WHICH restaurant to show; access is decided by RLS and the staff membership check.
 */
async function requestHost(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || h.get("host") || "";
}

/**
 * Which restaurant this request is for, resolved from the host (spec §5) or, on a deployment with preview links
 * switched on, from the preview cookie on the bare root address (`resolveSiteSlug`: a real subdomain always wins).
 * This is the ONLY source of the tenant for pages and actions — never a form field or query parameter. Like the
 * host, the preview cookie only picks WHICH restaurant to show; access is still decided by RLS and the membership
 * check. Cached per request, so a page and its layout share one lookup.
 */
export const getCurrentSite = cache(async (): Promise<Site> => {
  const preview = previewLinksEnabled()
    ? { enabled: true, slug: (await cookies()).get(PREVIEW_COOKIE)?.value ?? null }
    : { enabled: false, slug: null };
  const resolved = resolveSiteSlug(await requestHost(), appRootDomain(), preview);
  if (!resolved) return { kind: "platform" };
  const result = await getPublicRestaurant({ slug: resolved.slug });
  if (!result.ok) return resolved.via === "preview" ? { kind: "platform" } : { kind: "unknown" };
  return resolved.via === "preview"
    ? { kind: "restaurant", restaurant: result.value, viaPreview: true }
    : { kind: "restaurant", restaurant: result.value };
});

/**
 * Is this request on the platform's own address (no restaurant subdomain)? From the HOST only, ignoring any preview
 * cookie, so the founders' setup tool can never turn into a restaurant's page (or the other way round).
 */
export async function isPlatformAddress(): Promise<boolean> {
  return slugFromHost(await requestHost(), appRootDomain()) === null;
}

/**
 * The address of a restaurant's own site (`https://<slug>.<root domain>`), with the scheme and port of the request
 * being answered, so links work the same on a developer's machine and in production. The root domain comes from the
 * server's configuration, never from the request. With preview links switched on (no restaurant subdomains on this
 * deployment) it is the preview link `https://<root domain>/r/<slug>` instead; paths appended to either work.
 */
export async function restaurantOrigin(slug: string): Promise<string> {
  const h = await headers();
  const port = (await requestHost()).match(/:\d{1,5}$/)?.[0] ?? "";
  const forwarded = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const scheme = forwarded === "http" || forwarded === "https" ? forwarded : appRootDomain() === "localhost" ? "http" : "https";
  return previewLinksEnabled()
    ? `${scheme}://${appRootDomain()}${port}/r/${slug}`
    : `${scheme}://${slug}.${appRootDomain()}${port}`;
}
