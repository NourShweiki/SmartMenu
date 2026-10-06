import { updateOptionGroup, type OptionGroup, type OptionGroupId, type OptionGroupInput } from "@/domain/menu/options";
import { err, type Result } from "@/domain/shared/result";
import type { OptionsRepository } from "@/application/ports/options-repository";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "../shared";

/** Rename a group or change how many options customers must/may pick. */
export function makeEditOptionGroup(deps: { options: OptionsRepository }) {
  return async (
    actor: MenuActor,
    input: OptionGroupInput & { groupId: OptionGroupId },
  ): Promise<Result<OptionGroup, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;
    const group = await deps.options.findGroup(actor.restaurantId, input.groupId);
    if (!group) return err({ type: "GROUP_NOT_FOUND" });
    const updated = updateOptionGroup(group, input);
    if (!updated.ok) return updated;
    await deps.options.updateGroup(updated.value);
    return updated;
  };
}
