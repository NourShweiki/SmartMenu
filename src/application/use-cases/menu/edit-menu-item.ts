import { updateMenuItem, type CategoryId, type MenuItem, type MenuItemId, type MenuItemInput } from "@/domain/menu/menu";
import { err, type Result } from "@/domain/shared/result";
import type { MenuRepository } from "@/application/ports/menu-repository";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "./shared";

/** Change name/description/price/position and optionally the category. */
export function makeEditMenuItem(deps: { menu: MenuRepository }) {
  return async (
    actor: MenuActor,
    input: MenuItemInput & { itemId: MenuItemId; categoryId: CategoryId },
  ): Promise<Result<MenuItem, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    const item = await deps.menu.findItem(actor.restaurantId, input.itemId);
    if (!item) return err({ type: "ITEM_NOT_FOUND" });
    const category = await deps.menu.findCategory(actor.restaurantId, input.categoryId);
    if (!category) return err({ type: "CATEGORY_NOT_FOUND" });

    const updated = updateMenuItem(item, input, category);
    if (!updated.ok) return updated;
    await deps.menu.updateItem(updated.value);
    return updated;
  };
}
