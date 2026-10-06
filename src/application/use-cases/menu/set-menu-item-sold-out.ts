import type { MenuItemId } from "@/domain/menu/menu";
import { err, ok, type Result } from "@/domain/shared/result";
import type { MenuRepository } from "@/application/ports/menu-repository";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "./shared";

/** Owner, manager AND waiter (menu:sold-out): "we ran out" / "back in stock" during service. */
export function makeSetMenuItemSoldOut(deps: { menu: MenuRepository }) {
  return async (
    actor: MenuActor,
    input: { itemId: MenuItemId; isSoldOut: boolean },
  ): Promise<Result<true, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:sold-out");
    if (!allowed.ok) return allowed;

    // Goes through the narrow DB function, the only write path waiters have.
    const done = await deps.menu.setItemSoldOut(actor.restaurantId, input.itemId, input.isSoldOut);
    return done ? ok(true) : err({ type: "ITEM_NOT_FOUND" });
  };
}
