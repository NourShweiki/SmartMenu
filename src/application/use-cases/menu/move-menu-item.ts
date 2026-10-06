import type { MenuItemId } from "@/domain/menu/menu";
import { moveInOrder, type Direction } from "@/domain/shared/ordering";
import { err, ok, type Result } from "@/domain/shared/result";
import type { MenuRepository } from "@/application/ports/menu-repository";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "./shared";

/** Move an item one place up or down within its own category. */
export function makeMoveMenuItem(deps: { menu: MenuRepository }) {
  return async (
    actor: MenuActor,
    input: { itemId: MenuItemId; direction: Direction },
  ): Promise<Result<true, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    const items = await deps.menu.listItems(actor.restaurantId); // live, in display order
    const item = items.find((i) => i.id === input.itemId);
    if (!item) return err({ type: "ITEM_NOT_FOUND" });

    const siblings = items.filter((i) => i.categoryId === item.categoryId);
    const changes = moveInOrder(siblings, item.id, input.direction);
    await Promise.all(
      changes.map(({ id, sortOrder }) => deps.menu.updateItem({ ...siblings.find((i) => i.id === id)!, sortOrder })),
    );
    return ok(true);
  };
}
