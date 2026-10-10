import type { OrderError } from "@/domain/order/order";
import type { ForbiddenError } from "../permissions";

export type OrderUseCaseError =
  | OrderError
  | ForbiddenError
  | { type: "ITEM_NOT_FOUND"; menuItemId: string }
  | { type: "ORDER_NOT_FOUND" }
  /** Someone else moved the order first (or the database refused this user). Reload and try again. */
  | { type: "CONFLICT" };
