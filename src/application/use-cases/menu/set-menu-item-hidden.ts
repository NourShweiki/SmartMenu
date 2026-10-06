import { setItemHidden, type MenuItem, type MenuItemId } from "@/domain/menu/menu";
import { err, type Result } from "@/domain/shared/result";
import type { MenuRepository } from "@/application/ports/menu-repository";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "./shared";

export function makeSetMenuItemHidden(deps: { menu: MenuRepository }) {
  return async (
    actor: MenuActor,
    input: { itemId: MenuItemId; isHidden: boolean },
  ): Promise<Result<MenuItem, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    const item = await deps.menu.findItem(actor.restaurantId, input.itemId);
    if (!item) return err({ type: "ITEM_NOT_FOUND" });
    const updated = setItemHidden(item, input.isHidden);
    if (!updated.ok) return updated;
    await deps.menu.updateItem(updated.value);
    return updated;
  };
}
