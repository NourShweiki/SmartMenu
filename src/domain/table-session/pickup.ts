import { normalizeJordanMobile } from "@/domain/shared/phone";
import { err, ok, type Result } from "@/domain/shared/result";

/**
 * A session is a visit at a table, or a PICKUP visit: a takeout customer who orders ahead and collects at the
 * cashier (PROJECT_SPEC.md §4, "Takeout design"). A pickup visit is a table session without a table: it carries the
 * customer instead, starts with its first order and ends by itself when its last order is completed or cancelled.
 */
export const SESSION_KINDS = ["TABLE", "PICKUP"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

/** Who a pickup order is for. Customers have no accounts: this is all that is known about them. */
export type PickupCustomer = {
  /** What the staff call out at the counter. */
  readonly name: string;
  /** A Jordanian mobile number in international form (+9627XXXXXXXX). Not verified (no code by SMS for now). */
  readonly phone: string;
};

export const MAX_CUSTOMER_NAME_LENGTH = 60;

export type PickupError = { type: "NAME_REQUIRED" } | { type: "NAME_TOO_LONG"; max: number } | { type: "NAME_INVALID" } | { type: "PHONE_INVALID" };

/**
 * Tidies and checks what the customer typed. The name is trimmed and inner runs of spaces collapse to one; letters
 * of any language are fine, control characters and markup are not (the database refuses the same set). The number
 * is brought into international form.
 */
export function createPickupCustomer(input: { name: string; phone: string }): Result<PickupCustomer, PickupError> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name === "") return err({ type: "NAME_REQUIRED" });
  if ([...name].length > MAX_CUSTOMER_NAME_LENGTH) return err({ type: "NAME_TOO_LONG", max: MAX_CUSTOMER_NAME_LENGTH });
  if (/[\u0000-\u001f\u007f-\u009f<>]/.test(name)) return err({ type: "NAME_INVALID" });

  const phone = normalizeJordanMobile(input.phone);
  if (!phone) return err({ type: "PHONE_INVALID" });
  return ok({ name, phone });
}
