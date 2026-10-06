import { updateCategory, type CategoryId, type CategoryInput, type MenuCategory } from "@/domain/menu/menu";
import { err, type Result } from "@/domain/shared/result";
import type { MenuRepository } from "@/application/ports/menu-repository";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "./shared";

/** Rename a category and/or change its position. */
export function makeEditMenuCategory(deps: { menu: MenuRepository }) {
  return async (
    actor: MenuActor,
    input: CategoryInput & { categoryId: CategoryId },
  ): Promise<Result<MenuCategory, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    const category = await deps.menu.findCategory(actor.restaurantId, input.categoryId);
    if (!category) return err({ type: "CATEGORY_NOT_FOUND" });
    const updated = updateCategory(category, input);
    if (!updated.ok) return updated;
    await deps.menu.updateCategory(updated.value);
    return updated;
  };
}
