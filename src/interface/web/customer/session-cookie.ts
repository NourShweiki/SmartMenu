import { cookies } from "next/headers";

/**
 * Which table session this device belongs to, kept in a cookie. The SERVER sets it when a QR code is scanned and reads
 * it on every request: it works without JavaScript, the page can show the table straight away, and placing an order
 * will take the session from here rather than trusting what the browser sends in a form.
 *
 * It is a host-only cookie (no Domain), so each restaurant's address has its own and one restaurant can never read
 * another's. HttpOnly (page scripts cannot read it), SameSite=Lax (not sent on cross-site requests), and Secure on https.
 * The value is only the session id: the table's name and status always come from the database.
 */
export const SESSION_COOKIE = "smartmenu_table_session";

/** A visit rarely lasts longer than this; after it the guest simply scans the QR code again. */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The session id this device holds, or null (no cookie, or not a valid id). */
export async function readSessionId(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value && UUID.test(value) ? value : null;
}

/** Options for the Set-Cookie of a scan (used by the scan route). */
export const sessionCookieOptions = (secure: boolean) =>
  ({ httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: SESSION_MAX_AGE_SECONDS }) as const;
