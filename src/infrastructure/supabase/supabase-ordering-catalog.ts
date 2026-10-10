import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogEntry, OrderingCatalog } from "@/application/ports/ordering-catalog";
import type { MenuItemId } from "@/domain/menu/menu";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import {
  CATEGORY_COLUMNS,
  ITEM_COLUMNS,
  toCategory,
  toItem,
  type CategoryRow,
  type ItemRow,
} from "./supabase-menu-repository";
import {
  GROUP_COLUMNS,
  OPTION_COLUMNS,
  toGroup,
  toOption,
  UUID,
  type GroupRow,
  type OptionRow,
} from "./supabase-options-repository";

type LinkRow = { item_id: string; group_id: string; sort_order: number };

/**
 * Reads the live menu for building an order on behalf of a customer (no account, so it uses the server-side
 * client). Every query is scoped by restaurant_id, which the caller resolved from the host.
 */
export class SupabaseOrderingCatalog implements OrderingCatalog {
  constructor(private readonly db: SupabaseClient) {}

  async findEntries(restaurantId: RestaurantId, itemIds: readonly MenuItemId[]): Promise<CatalogEntry[]> {
    // Ids come from a customer's cart: a non-UUID can't match a row and would make Postgres throw.
    const ids = [...new Set(itemIds.filter((id) => UUID.test(id)))];
    if (ids.length === 0) return [];

    const items = await this.rows<ItemRow>(
      this.db.from("menu_items").select(ITEM_COLUMNS).eq("restaurant_id", restaurantId).in("id", ids),
      "items",
    );
    if (items.length === 0) return [];

    const [categories, links] = await Promise.all([
      this.rows<CategoryRow>(
        this.db
          .from("menu_categories")
          .select(CATEGORY_COLUMNS)
          .eq("restaurant_id", restaurantId)
          .in("id", [...new Set(items.map((i) => i.category_id))]),
        "categories",
      ),
      this.rows<LinkRow>(
        this.db
          .from("menu_item_option_groups")
          .select("item_id, group_id, sort_order")
          .eq("restaurant_id", restaurantId)
          .in("item_id", items.map((i) => i.id)),
        "item option groups",
      ),
    ]);

    const groupIds = [...new Set(links.map((l) => l.group_id))];
    const [groups, options] =
      groupIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.rows<GroupRow>(
              this.db.from("option_groups").select(GROUP_COLUMNS).eq("restaurant_id", restaurantId).in("id", groupIds).is("deleted_at", null),
              "option groups",
            ),
            this.rows<OptionRow>(
              this.db.from("options").select(OPTION_COLUMNS).eq("restaurant_id", restaurantId).in("group_id", groupIds).is("deleted_at", null),
              "options",
            ),
          ]);

    const categoryById = new Map(categories.map((c) => [c.id, toCategory(c)]));
    const groupById = new Map(groups.map((g) => [g.id as string, toGroup(g)]));
    const optionsByGroup = new Map<string, ReturnType<typeof toOption>[]>();
    for (const row of options) {
      const option = toOption(row);
      optionsByGroup.set(option.groupId, [...(optionsByGroup.get(option.groupId) ?? []), option]);
    }

    return items.flatMap((row): CatalogEntry[] => {
      const category = categoryById.get(row.category_id);
      if (!category) return []; // an item without its category cannot be ordered
      const attached = links
        .filter((l) => l.item_id === row.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .flatMap(({ group_id }) => {
          const group = groupById.get(group_id);
          return group
            ? [{ group, options: [...(optionsByGroup.get(group_id) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder) }]
            : [];
        });
      return [{ item: toItem(row), category, groups: attached }];
    });
  }

  private async rows<T>(
    query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
    what: string,
  ): Promise<T[]> {
    const { data, error } = await query;
    if (error) throw new Error(`read ${what} failed: ${error.message}`);
    return (data ?? []) as T[];
  }
}
