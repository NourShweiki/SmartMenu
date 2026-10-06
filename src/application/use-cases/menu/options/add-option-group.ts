import { createOptionGroup, type OptionGroup, type OptionGroupInput } from "@/domain/menu/options";
import type { Result } from "@/domain/shared/result";
import type { OptionsRepository } from "@/application/ports/options-repository";
import type { IdGenerator } from "@/application/ports/system";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "../shared";

export function makeAddOptionGroup(deps: { options: OptionsRepository; ids: IdGenerator }) {
  return async (actor: MenuActor, input: OptionGroupInput): Promise<Result<OptionGroup, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;
    const group = createOptionGroup(actor.restaurantId, input, deps.ids);
    if (!group.ok) return group;
    await deps.options.insertGroup(group.value);
    return group;
  };
}
