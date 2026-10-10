import type { MenuCategory, MenuItem } from "@/domain/menu/menu";
import type { MenuOption, OptionGroup } from "@/domain/menu/options";
import type { RestaurantId } from "@/domain/restaurant/restaurant";

export type PublicOptionGroup = { group: OptionGroup; options: MenuOption[] };
export type PublicMenuItem = { item: MenuItem; groups: PublicOptionGroup[] };
export type PublicMenuSection = { category: MenuCategory; items: PublicMenuItem[] };

/**
 * The menu as the public sees it: read through a narrow public database function (no login, no table access).
 * The restaurant is resolved from the host by the caller, never from the request body.
 */
export interface PublicMenuRepository {
  /** Visible categories and items (sold-out ones included, marked), with their option groups, in menu order. */
  findForRestaurant(restaurant: { id: RestaurantId; slug: string }): Promise<PublicMenuSection[]>;
}
