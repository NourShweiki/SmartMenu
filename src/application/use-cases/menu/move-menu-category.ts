import type { CategoryId } from "@/domain/menu/menu";
import { moveInOrder, type Direction } from "@/domain/shared/ordering";
import { err, ok, type Result } from "@/domain/shared/result";
import type { MenuRepository } from "@/application/ports/menu-repository";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "./shared";

/** Move a category one place up or down the menu. */
export function makeMoveMenuCategory(deps: { menu: MenuRepository }) {
  return async (
    actor: MenuActor,
    input: { categoryId: CategoryId; direction: Direction },
  ): Promise<Result<true, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    const categories = await deps.menu.listCategories(actor.restaurantId); // live, in display order
    if (!categories.some((c) => c.id === input.categoryId)) return err({ type: "CATEGORY_NOT_FOUND" });

    const changes = moveInOrder(categories, input.categoryId, input.direction);
    await Promise.all(
      changes.map(({ id, sortOrder }) => {
        const category = categories.find((c) => c.id === id)!;
        return deps.menu.updateCategory({ ...category, sortOrder });
      }),
    );
    return ok(true);
  };
}
