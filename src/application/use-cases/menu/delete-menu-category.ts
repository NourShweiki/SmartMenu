import { deleteCategory, type CategoryId, type MenuCategory } from "@/domain/menu/menu";
import { err, type Result } from "@/domain/shared/result";
import type { MenuRepository } from "@/application/ports/menu-repository";
import type { Clock } from "@/application/ports/system";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "./shared";

/** Soft-deletes an EMPTY category; with live items it returns CATEGORY_NOT_EMPTY. */
export function makeDeleteMenuCategory(deps: { menu: MenuRepository; clock: Clock }) {
  return async (
    actor: MenuActor,
    input: { categoryId: CategoryId },
  ): Promise<Result<MenuCategory, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    const category = await deps.menu.findCategory(actor.restaurantId, input.categoryId);
    if (!category) return err({ type: "CATEGORY_NOT_FOUND" });
    // listItems only returns live (not deleted) items of this restaurant.
    const liveItems = (await deps.menu.listItems(actor.restaurantId)).filter((i) => i.categoryId === category.id);

    const deleted = deleteCategory(category, liveItems.length, deps.clock.now());
    if (!deleted.ok) return deleted;
    await deps.menu.updateCategory(deleted.value);
    return deleted;
  };
}
