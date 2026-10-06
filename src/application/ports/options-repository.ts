import type { MenuItemId } from "@/domain/menu/menu";
import type { MenuOption, OptionGroup, OptionGroupId, OptionId } from "@/domain/menu/options";
import type { RestaurantId } from "@/domain/restaurant/restaurant";

export type ItemGroupLink = { itemId: MenuItemId; groupId: OptionGroupId; sortOrder: number };

/** Option groups, their options and which items use them — always scoped to one restaurant. */
export interface OptionsRepository {
  /** Live (not deleted) groups / options, ordered by sortOrder. */
  listGroups(restaurantId: RestaurantId): Promise<OptionGroup[]>;
  listOptions(restaurantId: RestaurantId): Promise<MenuOption[]>;
  findGroup(restaurantId: RestaurantId, id: OptionGroupId): Promise<OptionGroup | null>;
  findOption(restaurantId: RestaurantId, id: OptionId): Promise<MenuOption | null>;

  insertGroup(group: OptionGroup): Promise<void>;
  updateGroup(group: OptionGroup): Promise<void>;
  insertOption(option: MenuOption): Promise<void>;
  updateOption(option: MenuOption): Promise<void>;

  listLinks(restaurantId: RestaurantId): Promise<ItemGroupLink[]>;
  /** Makes the item's groups exactly `groupIds`, in that order. */
  setItemGroups(restaurantId: RestaurantId, itemId: MenuItemId, groupIds: OptionGroupId[]): Promise<void>;
  detachGroupFromAllItems(restaurantId: RestaurantId, groupId: OptionGroupId): Promise<void>;
}
