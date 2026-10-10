import type { MenuItemId } from "@/domain/menu/menu";
import type { OrderLineRequest } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";

/** What the domain needs to check one cart line: the live item, its category and its option groups. */
export type CatalogEntry = Pick<OrderLineRequest, "item" | "category" | "groups">;

/**
 * Live menu data for building an order, read for a customer who has no account. The adapter reads it
 * server-side; the restaurantId always comes from the host, never from the request body.
 */
export interface OrderingCatalog {
  /** Entries for the requested items that exist in this restaurant (unknown ids are simply missing). */
  findEntries(restaurantId: RestaurantId, itemIds: readonly MenuItemId[]): Promise<CatalogEntry[]>;
}
