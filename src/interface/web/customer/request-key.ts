/**
 * The key that makes "Place order" safe to press twice.
 *
 * The device makes up one random key per submission and sends it with the cart. If the reply is lost (weak Wi-Fi)
 * and the guest presses again, the SAME key goes out, and the server answers with the order it already stored
 * instead of storing a second one (see `placeOrder` and the `orders_client_request_key` index).
 *
 * "The same submission" means: the same cart contents, tried again soon. So the key is remembered next to the cart
 * (it survives a reload, which is what people do when something looks stuck) and is thrown away when
 *   - the order went through (`forgetRequestKey`),
 *   - the cart changed (different contents = a different order), or
 *   - it has not been used for `REQUEST_KEY_MAX_AGE_MS` (each retry keeps it alive: someone who keeps pressing
 *     on a bad connection is still making the same submission).
 * The age limit matters: without it, a guest whose first attempt DID reach the kitchen (but who never saw the
 * confirmation) and who later orders the very same things again would be handed the old order number while
 * nothing new reaches the kitchen. A retry comes within a minute or two; a second round comes later.
 */
export const REQUEST_KEY_MAX_AGE_MS = 5 * 60 * 1000;

const storageKey = (restaurantSlug: string) => `smartmenu:order-request:${restaurantSlug}`;

type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** A cart line as far as "is it the same order?" goes: its key (item + choices, see `lineKey` in domain/cart) and how many. */
type CartLineLike = { readonly key: string; readonly quantity: number };

/** A random UUID. `crypto.randomUUID` only exists on https and localhost; a phone on the restaurant's LAN over http still gets one. */
export function newRequestKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** What the order consists of, in a form that is equal exactly when the cart contents are equal. */
const fingerprint = (lines: readonly CartLineLike[]) => JSON.stringify(lines.map((l) => [l.key, l.quantity]));

/**
 * The key to send with these cart lines: the one from the last attempt when it was for the same contents and was
 * used recently, otherwise a new one. Either way it is remembered with the time of THIS attempt. Storage can be
 * missing, blocked or full: then every attempt simply gets a new key, as if this protection were not there.
 */
export function requestKeyFor(
  store: KeyStore | null,
  restaurantSlug: string,
  lines: readonly CartLineLike[],
  now: number,
  newKey: () => string = newRequestKey,
): string {
  const cart = fingerprint(lines);
  let key: string | null = null;
  try {
    const saved: unknown = JSON.parse(store?.getItem(storageKey(restaurantSlug)) ?? "null");
    if (typeof saved === "object" && saved !== null) {
      const { key: savedKey, cart: savedCart, at } = saved as { key?: unknown; cart?: unknown; at?: unknown };
      const recent = typeof at === "number" && now - at >= 0 && now - at < REQUEST_KEY_MAX_AGE_MS;
      if (typeof savedKey === "string" && savedKey !== "" && savedCart === cart && recent) key = savedKey;
    }
  } catch {
    // Unreadable: a new key.
  }
  key ??= newKey();
  try {
    store?.setItem(storageKey(restaurantSlug), JSON.stringify({ key, cart, at: now }));
  } catch {
    // Not remembered: a retry will not be recognised, nothing else breaks.
  }
  return key;
}

/** The order went through: the next submission, even of the same things, is a new order. */
export function forgetRequestKey(store: KeyStore | null, restaurantSlug: string): void {
  try {
    store?.removeItem(storageKey(restaurantSlug));
  } catch {
    // Nothing to do.
  }
}
