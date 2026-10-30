import type { SignInError } from "@/application/ports/auth-gateway";
import type { SignInAttemptLog } from "@/application/ports/sign-in-attempt-log";
import type { Clock } from "@/application/ports/system";
import { err, type Result } from "@/domain/shared/result";
import { failureWindowStart, isSignInBlocked, signInKeys } from "@/domain/shared/sign-in-limit";

export type TooManyAttempts = { type: "TOO_MANY_ATTEMPTS" };

/** What a limited sign-in needs on top of its own input: the visitor's hashed address, when known. */
export type LimitedSignInInput<I> = I & { email: string; visitorHash: string | null };

/**
 * Wraps a sign-in (staff or founder) in the attempt limit of `sign-in-limit.ts`. Over the limit, the password is not
 * even tried: the visitor is told to wait. Every refusal of the wrapped sign-in counts as a failure (also a right
 * password for somebody who is not staff HERE, which the visitor cannot tell apart anyway). A success forgets the
 * account's failures; the visitor's stay, so one machine cannot reset its count by signing in to its own account.
 */
export function makeLimitedSignIn<I extends { email: string }, T>(
  deps: { attempts: SignInAttemptLog; clock: Clock },
  signIn: (input: I) => Promise<Result<T, SignInError>>,
) {
  return async (input: LimitedSignInInput<I>): Promise<Result<T, SignInError | TooManyAttempts>> => {
    const { visitorHash, ...rest } = input;
    const keys = signInKeys(input.email, visitorHash);
    const counted = keys.visitor ? [keys.account, keys.visitor] : [keys.account];

    const now = deps.clock.now();
    const failures = await deps.attempts.countFailures(counted, failureWindowStart(now));
    if (isSignInBlocked({ account: failures[keys.account] ?? 0, visitor: keys.visitor ? (failures[keys.visitor] ?? 0) : 0 })) {
      return err({ type: "TOO_MANY_ATTEMPTS" });
    }

    const result = await signIn(rest as unknown as I);
    if (result.ok) await deps.attempts.clearFailures(keys.account);
    else await deps.attempts.recordFailure(counted, now);
    return result;
  };
}
