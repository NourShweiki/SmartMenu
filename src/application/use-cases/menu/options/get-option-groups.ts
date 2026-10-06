import type { MenuItemId } from "@/domain/menu/menu";
import type { MenuOption, OptionGroup } from "@/domain/menu/options";
import { can } from "@/domain/restaurant/role";
import type { OptionsRepository } from "@/application/ports/options-repository";
import type { MenuActor } from "../shared";

export type OptionGroupView = { group: OptionGroup; options: MenuOption[]; itemIds: MenuItemId[] };
export type StaffOptionGroups = { groups: OptionGroupView[]; canManage: boolean };

/** All live option groups with their options and the items using them. */
export function makeGetOptionGroups(deps: { options: OptionsRepository }) {
  return async (actor: MenuActor): Promise<StaffOptionGroups> => {
    const [groups, options, links] = await Promise.all([
      deps.options.listGroups(actor.restaurantId),
      deps.options.listOptions(actor.restaurantId),
      deps.options.listLinks(actor.restaurantId),
    ]);
    return {
      groups: groups.map((group) => ({
        group,
        options: options.filter((o) => o.groupId === group.id),
        itemIds: links.filter((l) => l.groupId === group.id).map((l) => l.itemId),
      })),
      canManage: can(actor.role, "menu:manage"),
    };
  };
}
