import { createMenuItem, type CategoryId, type MenuItem, type MenuItemInput } from "@/domain/menu/menu";
import { err, type Result } from "@/domain/shared/result";
import type { MenuRepository } from "@/application/ports/menu-repository";
import type { IdGenerator } from "@/application/ports/system";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "./shared";

export function makeAddMenuItem(deps: { menu: MenuRepository; ids: IdGenerator }) {
  return async (
    actor: MenuActor,
    input: MenuItemInput & { categoryId: CategoryId },
  ): Promise<Result<MenuItem, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    // Looked up inside the actor's restaurant, so another restaurant's category id finds nothing.
    const category = await deps.menu.findCategory(actor.restaurantId, input.categoryId);
    if (!category) return err({ type: "CATEGORY_NOT_FOUND" });

    const item = createMenuItem(category, input, deps.ids);
    if (!item.ok) return item;
    await deps.menu.insertItem(item.value);
    return item;
  };
}
