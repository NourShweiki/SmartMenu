import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemGroupLink, OptionsRepository } from "@/application/ports/options-repository";
import type { MenuItemId } from "@/domain/menu/menu";
import type { MenuOption, OptionGroup, OptionGroupId, OptionId } from "@/domain/menu/options";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Fils } from "@/domain/shared/money";

type GroupRow = {
  id: string;
  restaurant_id: string;
  name_en: string;
  name_ar: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  deleted_at: string | null;
};
type OptionRow = {
  id: string;
  restaurant_id: string;
  group_id: string;
  name_en: string;
  name_ar: string;
  price_delta_fils: number;
  sort_order: number;
  deleted_at: string | null;
};
type LinkRow = { item_id: string; group_id: string; sort_order: number };

const GROUP_COLUMNS = "id, restaurant_id, name_en, name_ar, min_select, max_select, sort_order, deleted_at";
const OPTION_COLUMNS = "id, restaurant_id, group_id, name_en, name_ar, price_delta_fils, sort_order, deleted_at";
/** Ids reach us from forms/URLs; a non-UUID can't match a row and would make Postgres throw. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const date = (s: string | null) => (s ? new Date(s) : null);

export const toGroup = (r: GroupRow): OptionGroup => ({
  id: r.id as OptionGroupId,
  restaurantId: r.restaurant_id as RestaurantId,
  name: { en: r.name_en, ar: r.name_ar },
  minSelect: r.min_select,
  maxSelect: r.max_select,
  sortOrder: r.sort_order,
  deletedAt: date(r.deleted_at),
});

export const toOption = (r: OptionRow): MenuOption => ({
  id: r.id as OptionId,
  restaurantId: r.restaurant_id as RestaurantId,
  groupId: r.group_id as OptionGroupId,
  name: { en: r.name_en, ar: r.name_ar },
  priceDeltaFils: Number(r.price_delta_fils) as Fils,
  sortOrder: r.sort_order,
  deletedAt: date(r.deleted_at),
});

/** Only the columns staff may UPDATE (see the option groups migration's column grants). */
const editableGroup = (g: OptionGroup) => ({
  name_en: g.name.en,
  name_ar: g.name.ar,
  min_select: g.minSelect,
  max_select: g.maxSelect,
  sort_order: g.sortOrder,
  deleted_at: g.deletedAt?.toISOString() ?? null,
});
const editableOption = (o: MenuOption) => ({
  name_en: o.name.en,
  name_ar: o.name.ar,
  price_delta_fils: o.priceDeltaFils,
  sort_order: o.sortOrder,
  deleted_at: o.deletedAt?.toISOString() ?? null,
});

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

/** Use with the signed-in staff user's client so RLS applies as that user. */
export class SupabaseOptionsRepository implements OptionsRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listGroups(restaurantId: RestaurantId): Promise<OptionGroup[]> {
    const { data, error } = await this.db
      .from("option_groups")
      .select(GROUP_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at")
      .returns<GroupRow[]>();
    check("option_groups list", error);
    return (data ?? []).map(toGroup);
  }

  async listOptions(restaurantId: RestaurantId): Promise<MenuOption[]> {
    const { data, error } = await this.db
      .from("options")
      .select(OPTION_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at")
      .returns<OptionRow[]>();
    check("options list", error);
    return (data ?? []).map(toOption);
  }

  async findGroup(restaurantId: RestaurantId, id: OptionGroupId): Promise<OptionGroup | null> {
    if (!UUID.test(id)) return null;
    const { data, error } = await this.db
      .from("option_groups")
      .select(GROUP_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .eq("id", id)
      .maybeSingle<GroupRow>();
    check("option_groups find", error);
    return data ? toGroup(data) : null;
  }

  async findOption(restaurantId: RestaurantId, id: OptionId): Promise<MenuOption | null> {
    if (!UUID.test(id)) return null;
    const { data, error } = await this.db
      .from("options")
      .select(OPTION_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .eq("id", id)
      .maybeSingle<OptionRow>();
    check("options find", error);
    return data ? toOption(data) : null;
  }

  async insertGroup(g: OptionGroup): Promise<void> {
    const { error } = await this.db.from("option_groups").insert({ id: g.id, restaurant_id: g.restaurantId, ...editableGroup(g) });
    check("option_groups insert", error);
  }

  async updateGroup(g: OptionGroup): Promise<void> {
    const { error } = await this.db
      .from("option_groups")
      .update(editableGroup(g))
      .eq("restaurant_id", g.restaurantId)
      .eq("id", g.id);
    check("option_groups update", error);
  }

  async insertOption(o: MenuOption): Promise<void> {
    const { error } = await this.db
      .from("options")
      .insert({ id: o.id, restaurant_id: o.restaurantId, group_id: o.groupId, ...editableOption(o) });
    check("options insert", error);
  }

  async updateOption(o: MenuOption): Promise<void> {
    const { error } = await this.db
      .from("options")
      .update(editableOption(o))
      .eq("restaurant_id", o.restaurantId)
      .eq("id", o.id);
    check("options update", error);
  }

  async listLinks(restaurantId: RestaurantId): Promise<ItemGroupLink[]> {
    const { data, error } = await this.db
      .from("menu_item_option_groups")
      .select("item_id, group_id, sort_order")
      .eq("restaurant_id", restaurantId)
      .order("sort_order")
      .returns<LinkRow[]>();
    check("menu_item_option_groups list", error);
    return (data ?? []).map((r) => ({
      itemId: r.item_id as MenuItemId,
      groupId: r.group_id as OptionGroupId,
      sortOrder: r.sort_order,
    }));
  }

  /**
   * Applies only the difference, ADDING before REMOVING: if an add fails (e.g. a group that
   * isn't this restaurant's), the item keeps its old groups instead of ending up with none.
   */
  async setItemGroups(restaurantId: RestaurantId, itemId: MenuItemId, groupIds: OptionGroupId[]): Promise<void> {
    const current = (await this.listLinks(restaurantId)).filter((l) => l.itemId === itemId);
    const wanted = [...new Set(groupIds)];
    const removed = current.filter((l) => !wanted.includes(l.groupId)).map((l) => l.groupId);

    for (const [sortOrder, groupId] of wanted.entries()) {
      const existing = current.find((l) => l.groupId === groupId);
      if (!existing) {
        const { error } = await this.db
          .from("menu_item_option_groups")
          .insert({ restaurant_id: restaurantId, item_id: itemId, group_id: groupId, sort_order: sortOrder });
        check("menu_item_option_groups attach", error);
      } else if (existing.sortOrder !== sortOrder) {
        const { error } = await this.db
          .from("menu_item_option_groups")
          .update({ sort_order: sortOrder })
          .eq("restaurant_id", restaurantId)
          .eq("item_id", itemId)
          .eq("group_id", groupId);
        check("menu_item_option_groups reorder", error);
      }
    }
    if (removed.length > 0) {
      const { error } = await this.db
        .from("menu_item_option_groups")
        .delete()
        .eq("restaurant_id", restaurantId)
        .eq("item_id", itemId)
        .in("group_id", removed);
      check("menu_item_option_groups detach", error);
    }
  }

  async detachGroupFromAllItems(restaurantId: RestaurantId, groupId: OptionGroupId): Promise<void> {
    const { error } = await this.db
      .from("menu_item_option_groups")
      .delete()
      .eq("restaurant_id", restaurantId)
      .eq("group_id", groupId);
    check("menu_item_option_groups detach all", error);
  }
}
