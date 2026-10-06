import { deleteMenuItem, type MenuItem, type MenuItemId } from "@/domain/menu/menu";
import { err, type Result } from "@/domain/shared/result";
import type { MenuRepository } from "@/application/ports/menu-repository";
import type { Clock } from "@/application/ports/system";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "./shared";

/** Soft delete: past orders keep pointing at the item (and keep their own price snapshot). */
export function makeDeleteMenuItem(deps: { menu: MenuRepository; clock: Clock }) {
  return async (actor: MenuActor, input: { itemId: MenuItemId }): Promise<Result<MenuItem, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    const item = await deps.menu.findItem(actor.restaurantId, input.itemId);
    if (!item) return err({ type: "ITEM_NOT_FOUND" });
    const deleted = deleteMenuItem(item, deps.clock.now());
    if (!deleted.ok) return deleted;
    await deps.menu.updateItem(deleted.value);
    return deleted;
  };
}
