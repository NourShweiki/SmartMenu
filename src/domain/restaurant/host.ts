/**
 * Every client starts on a subdomain: <slug>.<rootDomain> (spec §5).
 * Returns the slug, or null when the host is the root domain itself or something else.
 * Custom domains (an upsell) will need a DB lookup and are not handled here yet.
 */
export function slugFromHost(host: string, rootDomain: string): string | null {
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, "");
  const root = rootDomain.trim().toLowerCase();
  if (!root || !hostname.endsWith(`.${root}`)) return null;

  const sub = hostname.slice(0, -(root.length + 1));
  // Only one level: a.b.ourapp.com is not a restaurant.
  if (!sub || sub.includes(".")) return null;
  return sub;
}
