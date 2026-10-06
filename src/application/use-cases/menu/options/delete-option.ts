import { deleteOption, type MenuOption, type OptionId } from "@/domain/menu/options";
import { err, type Result } from "@/domain/shared/result";
import type { OptionsRepository } from "@/application/ports/options-repository";
import type { Clock } from "@/application/ports/system";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "../shared";

export function makeDeleteOption(deps: { options: OptionsRepository; clock: Clock }) {
  return async (actor: MenuActor, input: { optionId: OptionId }): Promise<Result<MenuOption, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;
    const option = await deps.options.findOption(actor.restaurantId, input.optionId);
    if (!option) return err({ type: "OPTION_NOT_FOUND" });
    const deleted = deleteOption(option, deps.clock.now());
    if (!deleted.ok) return deleted;
    await deps.options.updateOption(deleted.value);
    return deleted;
  };
}
