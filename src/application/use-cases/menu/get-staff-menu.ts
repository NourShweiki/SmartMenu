import type { MenuCategory, MenuItem } from "@/domain/menu/menu";
import { can } from "@/domain/restaurant/role";
import type { MenuRepository } from "@/application/ports/menu-repository";
import type { MenuActor } from "./shared";

export type StaffMenu = {
  sections: { category: MenuCategory; items: MenuItem[] }[];
  /** What the screen may offer this person. */
  canManage: boolean;
  canToggleSoldOut: boolean;
};

/** The full menu as staff see it (including hidden and sold-out items), grouped by category. */
export function makeGetStaffMenu(deps: { menu: MenuRepository }) {
  return async (actor: MenuActor): Promise<StaffMenu> => {
    const [categories, items] = await Promise.all([
      deps.menu.listCategories(actor.restaurantId),
      deps.menu.listItems(actor.restaurantId),
    ]);
    return {
      sections: categories.map((category) => ({
        category,
        items: items.filter((i) => i.categoryId === category.id),
      })),
      canManage: can(actor.role, "menu:manage"),
      canToggleSoldOut: can(actor.role, "menu:sold-out"),
    };
  };
}
