/**
 * A random, URL-safe token for a table's QR code: 18 bytes from the platform's cryptographically secure random
 * source = 144 bits, written as 24 characters (domain rule: at least 22 characters / 128 bits). Never derived from
 * the table's label or number, so one printed code reveals nothing about any other.
 *
 * Web Crypto (`crypto.getRandomValues`), not Node's `node:crypto`: this module is reachable from the middleware via
 * the composition root, and the middleware runs in a runtime that has no Node modules.
 */
export function newTableToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  // base64url without padding; 18 bytes is a multiple of 3, so there is none to strip.
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}
