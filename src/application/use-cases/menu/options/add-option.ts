import { createOption, type MenuOption, type OptionGroupId, type OptionInput } from "@/domain/menu/options";
import { err, type Result } from "@/domain/shared/result";
import type { OptionsRepository } from "@/application/ports/options-repository";
import type { IdGenerator } from "@/application/ports/system";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "../shared";

export function makeAddOption(deps: { options: OptionsRepository; ids: IdGenerator }) {
  return async (
    actor: MenuActor,
    input: OptionInput & { groupId: OptionGroupId },
  ): Promise<Result<MenuOption, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;
    // Looked up inside the actor's restaurant, so another restaurant's group finds nothing.
    const group = await deps.options.findGroup(actor.restaurantId, input.groupId);
    if (!group) return err({ type: "GROUP_NOT_FOUND" });
    const option = createOption(group, input, deps.ids);
    if (!option.ok) return option;
    await deps.options.insertOption(option.value);
    return option;
  };
}
