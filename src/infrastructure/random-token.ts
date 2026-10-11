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

/** Letters and digits that cannot be mistaken for one another when read out or typed (no 0/o, 1/l/i). */
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * A temporary password for a new member of staff, as `xxxx-xxxx-xxxx`: 12 random characters from 31 = about 59 bits,
 * from the platform's cryptographically secure random source. Meant to be passed on once and changed by its owner.
 * Bytes that would favour some characters over others are thrown away (no modulo bias).
 */
export function newTemporaryPassword(): string {
  const fair = 256 - (256 % PASSWORD_ALPHABET.length);
  const picked: string[] = [];
  while (picked.length < 12) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < fair && picked.length < 12) picked.push(PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]!);
    }
  }
  return [picked.slice(0, 4), picked.slice(4, 8), picked.slice(8, 12)].map((group) => group.join("")).join("-");
}
