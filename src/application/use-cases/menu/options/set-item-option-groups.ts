import type { MenuItemId } from "@/domain/menu/menu";
import type { OptionGroupId } from "@/domain/menu/options";
import { err, ok, type Result } from "@/domain/shared/result";
import type { MenuRepository } from "@/application/ports/menu-repository";
import type { OptionsRepository } from "@/application/ports/options-repository";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "../shared";

/** Choose which option groups an item offers (in this order). */
export function makeSetItemOptionGroups(deps: { menu: MenuRepository; options: OptionsRepository }) {
  return async (
    actor: MenuActor,
    input: { itemId: MenuItemId; groupIds: OptionGroupId[] },
  ): Promise<Result<true, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    const item = await deps.menu.findItem(actor.restaurantId, input.itemId);
    if (!item || item.deletedAt) return err({ type: "ITEM_NOT_FOUND" });
    // Every group must be a live group of THIS restaurant.
    const live = new Set((await deps.options.listGroups(actor.restaurantId)).map((g) => g.id as string));
    if (!input.groupIds.every((id) => live.has(id))) return err({ type: "GROUP_NOT_FOUND" });

    await deps.options.setItemGroups(actor.restaurantId, item.id, input.groupIds);
    return ok(true);
  };
}
