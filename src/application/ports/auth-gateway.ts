import type { Result } from "@/domain/shared/result";

export type UserId = string & { readonly __brand: "UserId" };

export type SignInError = { type: "INVALID_CREDENTIALS" };

/** Staff authentication (email + password). Customers never sign in. */
export interface AuthGateway {
  signInWithPassword(email: string, password: string): Promise<Result<{ userId: UserId }, SignInError>>;
  /** The signed-in user for this request, or null. */
  currentUserId(): Promise<UserId | null>;
  signOut(): Promise<void>;
}
