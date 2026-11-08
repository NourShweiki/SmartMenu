import { err, ok, type Result } from "@/domain/shared/result";

/**
 * Where to send "your order is ready" to a guest's phone when the menu page is closed (web push, docs/WEB_PUSH_PLAN.md).
 * The guest's browser makes it when they allow notifications: an address at their browser maker's push service, plus
 * two keys the message is encrypted with. It belongs to the guest's visit (table or pickup); storing it is step W2.
 */
export type PushSubscription = {
  /** The push service address the message is sent to. Always https on one of PUSH_SERVICE_HOSTS. */
  readonly endpoint: string;
  /** The browser's public encryption key: a P-256 point, 65 bytes, base64url without padding. */
  readonly p256dh: string;
  /** The browser's shared secret: 16 bytes, base64url without padding. */
  readonly auth: string;
};

/**
 * The push services of the browsers people use (Chrome / Android, Firefox, Safari / iPhone, Edge / Windows). A host
 * matches when it IS one of these or ends in "." + one of them. Our server sends a request to the endpoint, so an
 * address anywhere else (an internal one, an attacker's) is refused before it is ever stored.
 */
export const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "push.apple.com", "notify.windows.com"] as const;

/** Real endpoints are a few hundred characters; anything far longer is not one. */
export const MAX_PUSH_ENDPOINT_LENGTH = 1024;

export type PushSubscriptionError = { type: "ENDPOINT_INVALID" } | { type: "ENDPOINT_NOT_ALLOWED" } | { type: "KEYS_INVALID" };

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const P256DH_LENGTH = 87; // 65 bytes
const AUTH_LENGTH = 22; // 16 bytes

/**
 * Checks what the guest's browser sent (`PushSubscription.toJSON()` in the browser: `endpoint` and `keys`).
 * The endpoint must be a plain https address on the default port, without a user name, password or a trailing dot
 * on the host, and on a known push service. The keys must have the exact sizes web push uses.
 */
export function createPushSubscription(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Result<PushSubscription, PushSubscriptionError> {
  const { endpoint } = input;
  if (endpoint.length > MAX_PUSH_ENDPOINT_LENGTH || !URL.canParse(endpoint)) return err({ type: "ENDPOINT_INVALID" });
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "" || url.hostname.endsWith(".")) {
    return err({ type: "ENDPOINT_INVALID" });
  }
  const host = url.hostname;
  if (!PUSH_SERVICE_HOSTS.some((service) => host === service || host.endsWith(`.${service}`))) return err({ type: "ENDPOINT_NOT_ALLOWED" });

  const { p256dh, auth } = input.keys;
  // An uncompressed P-256 point starts with the byte 0x04, which base64url writes as "B" (with the next 2 bits zero).
  const pointOk = p256dh.length === P256DH_LENGTH && BASE64URL.test(p256dh) && p256dh.startsWith("B");
  const authOk = auth.length === AUTH_LENGTH && BASE64URL.test(auth);
  if (!pointOk || !authOk) return err({ type: "KEYS_INVALID" });

  return ok({ endpoint, p256dh, auth });
}
