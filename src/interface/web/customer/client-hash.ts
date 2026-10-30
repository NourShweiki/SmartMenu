import { headers } from "next/headers";

/** Addresses that say nothing about who is calling: the machine itself (local development, a proxy on the same host). */
const LOCAL = /^(::1|127\.|::ffff:127\.|localhost$)/;

/**
 * A stable, anonymous fingerprint of the device a public request came from: the SHA-256 of its network address,
 * salted with the restaurant's id (so the same visitor has a different fingerprint at every restaurant, and the
 * address itself is never stored). Used for ONE thing: limiting how many takeout orders one device starts.
 *
 * Null when the address is not known or is the machine itself: then that limit simply does not apply (the other
 * limits, per phone number and per restaurant, still do). The address comes from `x-forwarded-for`, which the
 * hosting platform sets; a visitor who can change addresses gets around this limit, which is why it is not the only one.
 */
export async function clientHashFor(restaurantId: string): Promise<string | null> {
  return hashedAddress(restaurantId);
}

/**
 * The same kind of fingerprint for SIGN-IN (staff and founders): one per visitor across the whole platform, not per
 * restaurant, so one machine trying passwords on many restaurants' accounts is counted as one. Null as above: then
 * only the per-account limit applies.
 */
export async function signInVisitorHash(): Promise<string | null> {
  return hashedAddress("sign-in");
}

/** SHA-256 of `<salt>|<address>`, or null when the address is unknown or local. */
async function hashedAddress(salt: string): Promise<string | null> {
  const h = await headers();
  const address = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim().toLowerCase();
  if (!address || LOCAL.test(address)) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${address}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
