import { deleteOptionGroup, type OptionGroup, type OptionGroupId } from "@/domain/menu/options";
import { err, type Result } from "@/domain/shared/result";
import type { OptionsRepository } from "@/application/ports/options-repository";
import type { Clock } from "@/application/ports/system";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "../shared";

/** Soft-deletes the group and detaches it from every item (the items themselves are untouched). */
export function makeDeleteOptionGroup(deps: { options: OptionsRepository; clock: Clock }) {
  return async (actor: MenuActor, input: { groupId: OptionGroupId }): Promise<Result<OptionGroup, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;
    const group = await deps.options.findGroup(actor.restaurantId, input.groupId);
    if (!group) return err({ type: "GROUP_NOT_FOUND" });
    const deleted = deleteOptionGroup(group, deps.clock.now());
    if (!deleted.ok) return deleted;
    await deps.options.detachGroupFromAllItems(actor.restaurantId, group.id);
    await deps.options.updateGroup(deleted.value);
    return deleted;
  };
}
