import type { OptionId } from "@/domain/menu/options";
import { moveInOrder, type Direction } from "@/domain/shared/ordering";
import { err, ok, type Result } from "@/domain/shared/result";
import type { OptionsRepository } from "@/application/ports/options-repository";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "../shared";

/** Move an option one place up or down within its group (e.g. Small, Medium, Large). */
export function makeMoveOption(deps: { options: OptionsRepository }) {
  return async (
    actor: MenuActor,
    input: { optionId: OptionId; direction: Direction },
  ): Promise<Result<true, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    const all = await deps.options.listOptions(actor.restaurantId); // live, in display order
    const option = all.find((o) => o.id === input.optionId);
    if (!option) return err({ type: "OPTION_NOT_FOUND" });

    const siblings = all.filter((o) => o.groupId === option.groupId);
    const changes = moveInOrder(siblings, option.id, input.direction);
    await Promise.all(
      changes.map(({ id, sortOrder }) => deps.options.updateOption({ ...siblings.find((o) => o.id === id)!, sortOrder })),
    );
    return ok(true);
  };
}
