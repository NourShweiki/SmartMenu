const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LENGTH = 254;

/**
 * An email address as somebody typed it, tidied for use as a sign-in name: trimmed and lower-case. `null` when it
 * cannot be an address. This is a first, cheap check; the sign-in service has the last word (it is stricter).
 */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email.length <= MAX_LENGTH && EMAIL.test(email) ? email : null;
}
