import { normalizeHost, slugFromHost } from "./host";
import { validateSlug } from "./restaurant";

/**
 * Preview links (decided 2026-11-23, PROJECT_SPEC.md §5): an address WITHOUT restaurant subdomains (a hosting
 * platform's own address such as `xxx.vercel.app`) can still show one restaurant, chosen by a preview cookie that
 * `/r/<slug>` sets. Off unless the deployment switches it on, and only on the bare root address: a restaurant's
 * real subdomain always wins, so the preview can never change which restaurant a real address shows.
 */
export type PreviewSettings = {
  /** The deployment's switch (RESTAURANT_PREVIEW_LINKS=1). */
  readonly enabled: boolean;
  /** The slug from the preview cookie, if any (the visitor's choice, like the address they typed). */
  readonly slug: string | null;
};

export type SiteSlug = { slug: string; via: "host" | "preview" };

/** Which restaurant slug a request is for, or null for the platform's own pages. */
export function resolveSiteSlug(host: string, rootDomain: string, preview: PreviewSettings): SiteSlug | null {
  const fromHost = slugFromHost(host, rootDomain);
  if (fromHost) return { slug: fromHost, via: "host" };

  const root = rootDomain.trim().toLowerCase();
  if (!preview.enabled || !preview.slug || !root || normalizeHost(host) !== root) return null;
  const slug = preview.slug.trim().toLowerCase();
  return validateSlug(slug).ok ? { slug, via: "preview" } : null;
}
