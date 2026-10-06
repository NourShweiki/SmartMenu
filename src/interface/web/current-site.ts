import { headers } from "next/headers";
import { cache } from "react";
import type { PublicRestaurant } from "@/application/ports/restaurant-repository";
import { slugFromHost } from "@/domain/restaurant/host";
import { appRootDomain, getPublicRestaurant } from "@/infrastructure/container";

export type Site =
  | { kind: "platform" } // the bare root domain (no restaurant)
  | { kind: "restaurant"; restaurant: PublicRestaurant }
  | { kind: "unknown" }; // a subdomain no restaurant owns

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
 * Which restaurant this request is for, resolved from the host (spec §5). This is the ONLY
 * source of the tenant for pages and actions — never a form field or query parameter.
 * Cached per request, so a page and its layout share one lookup.
 */
export const getCurrentSite = cache(async (): Promise<Site> => {
  const slug = slugFromHost(await requestHost(), appRootDomain());
  if (!slug) return { kind: "platform" };
  const result = await getPublicRestaurant({ slug });
  return result.ok ? { kind: "restaurant", restaurant: result.value } : { kind: "unknown" };
});
