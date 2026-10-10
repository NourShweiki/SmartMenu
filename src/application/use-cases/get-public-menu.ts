import type { PublicMenuItem, PublicMenuRepository } from "@/application/ports/public-menu-repository";
import { isOrderable, isVisibleToCustomers, type MenuCategory } from "@/domain/menu/menu";
import { isGroupOrderable } from "@/domain/menu/options";
import type { RestaurantId } from "@/domain/restaurant/restaurant";

export type CustomerMenuItem = PublicMenuItem & {
  /**
   * Can be added to a cart right now: the item is not sold out, and every required option group still has enough
   * live options (otherwise the customer could never satisfy its rule, so the item is shown but not orderable).
   */
  orderable: boolean;
};
export type CustomerMenuSection = { category: MenuCategory; items: CustomerMenuItem[] };
export type CustomerMenu = { sections: CustomerMenuSection[] };

/**
 * The customer menu: what to show and what can be ordered. The database already leaves out hidden and deleted
 * entries; this re-checks with the domain rules (defence in depth) and drops categories left empty.
 */
export function makeGetPublicMenu(deps: { menu: PublicMenuRepository }) {
  return async (restaurant: { id: RestaurantId; slug: string }): Promise<CustomerMenu> => {
    const sections = await deps.menu.findForRestaurant(restaurant);
    return {
      sections: sections
        .map(({ category, items }) => ({
          category,
          items: items
            .filter(({ item }) => isVisibleToCustomers(item, category))
            .map(
              (entry): CustomerMenuItem => ({
                ...entry,
                orderable:
                  isOrderable(entry.item, category) && entry.groups.every(({ group, options }) => isGroupOrderable(group, options)),
              }),
            ),
        }))
        .filter((section) => !section.category.isHidden && !section.category.deletedAt && section.items.length > 0),
    };
  };
}
