import { createCategory, type CategoryInput, type MenuCategory } from "@/domain/menu/menu";
import type { Result } from "@/domain/shared/result";
import type { MenuRepository } from "@/application/ports/menu-repository";
import type { IdGenerator } from "@/application/ports/system";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "./shared";

export function makeAddMenuCategory(deps: { menu: MenuRepository; ids: IdGenerator }) {
  return async (actor: MenuActor, input: CategoryInput): Promise<Result<MenuCategory, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    const category = createCategory(actor.restaurantId, input, deps.ids);
    if (!category.ok) return category;
    await deps.menu.insertCategory(category.value);
    return category;
  };
}
