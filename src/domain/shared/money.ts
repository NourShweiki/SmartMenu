import { err, ok, type Result } from "./result";

/**
 * Money is whole fils (1 JD = 1000 fils; JOD has 3 decimals). Never floats, never "cents".
 * Format to "1.250 JD" only at the UI edge (formatPrice).
 */
export type Fils = number & { readonly __brand: "Fils" };

/** Sanity cap for a single price: 1,000,000 JD. */
export const MAX_PRICE_FILS = 1_000_000_000;

export type MoneyError = { type: "INVALID_AMOUNT" };

export function toFils(amount: number): Result<Fils, MoneyError> {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_PRICE_FILS) {
    return err({ type: "INVALID_AMOUNT" });
  }
  return ok(amount as Fils);
}
