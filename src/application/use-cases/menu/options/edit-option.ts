import { updateOption, type MenuOption, type OptionId, type OptionInput } from "@/domain/menu/options";
import { err, type Result } from "@/domain/shared/result";
import type { OptionsRepository } from "@/application/ports/options-repository";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "../shared";

/** Change an option's name or extra price (past orders keep their own snapshot). */
export function makeEditOption(deps: { options: OptionsRepository }) {
  return async (
    actor: MenuActor,
    input: OptionInput & { optionId: OptionId },
  ): Promise<Result<MenuOption, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;
    const option = await deps.options.findOption(actor.restaurantId, input.optionId);
    if (!option) return err({ type: "OPTION_NOT_FOUND" });
    const updated = updateOption(option, input);
    if (!updated.ok) return updated;
    await deps.options.updateOption(updated.value);
    return updated;
  };
}
