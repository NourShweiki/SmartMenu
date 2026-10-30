/**
 * How many wrong passwords sign-in accepts before it asks the visitor to wait (security review, finding #1).
 * Counted twice: per ACCOUNT (the email typed, whether or not it exists, so the answer never tells which emails are
 * real) and per VISITOR (their network address, when known), over a sliding window. Staff and founders alike.
 *
 * Per account: slow enough that guessing a 10-character password is hopeless, loose enough that somebody who mistypes
 * a few times is not locked out for long. Per visitor: a little more room, since an office may share one address, but
 * it stops one machine from trying a list of passwords against many accounts.
 */
export const SIGN_IN_WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_ACCOUNT = 5;
export const MAX_FAILURES_PER_VISITOR = 20;

/** The keys failures are counted under. The visitor's is null when their address is unknown (no per-visitor limit). */
export type SignInKeys = { account: string; visitor: string | null };

/** Keys for one attempt. The email is compared the way sign-in compares it (trimmed, lower case). */
export function signInKeys(email: string, visitorHash: string | null): SignInKeys {
  return { account: `account:${email.trim().toLowerCase()}`, visitor: visitorHash ? `visitor:${visitorHash}` : null };
}

/** Failures that happened AFTER this moment still count: a failure stops counting exactly 15 minutes later. */
export function failureWindowStart(now: Date): Date {
  return new Date(now.getTime() - SIGN_IN_WINDOW_MINUTES * 60_000);
}

/** True when this attempt must not even be tried: the account or the visitor already used up its failures. */
export function isSignInBlocked(failures: { account: number; visitor: number }): boolean {
  return failures.account >= MAX_FAILURES_PER_ACCOUNT || failures.visitor >= MAX_FAILURES_PER_VISITOR;
}
