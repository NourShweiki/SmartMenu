import { setCategoryHidden, type CategoryId, type MenuCategory } from "@/domain/menu/menu";
import { err, type Result } from "@/domain/shared/result";
import type { MenuRepository } from "@/application/ports/menu-repository";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "./shared";

/** Hiding a category hides all its items from customers (items keep their own hidden flag). */
export function makeSetMenuCategoryHidden(deps: { menu: MenuRepository }) {
  return async (
    actor: MenuActor,
    input: { categoryId: CategoryId; isHidden: boolean },
  ): Promise<Result<MenuCategory, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    const category = await deps.menu.findCategory(actor.restaurantId, input.categoryId);
    if (!category) return err({ type: "CATEGORY_NOT_FOUND" });
    const updated = setCategoryHidden(category, input.isHidden);
    if (!updated.ok) return updated;
    await deps.menu.updateCategory(updated.value);
    return updated;
  };
}
