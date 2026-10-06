import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuRepository } from "@/application/ports/menu-repository";
import type { CategoryId, MenuCategory, MenuItem, MenuItemId } from "@/domain/menu/menu";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Fils } from "@/domain/shared/money";

export type CategoryRow = {
  id: string;
  restaurant_id: string;
  name_en: string;
  name_ar: string;
  sort_order: number;
  is_hidden: boolean;
  deleted_at: string | null;
};

export type ItemRow = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  price_fils: number;
  sort_order: number;
  is_hidden: boolean;
  is_sold_out: boolean;
  deleted_at: string | null;
};

const CATEGORY_COLUMNS = "id, restaurant_id, name_en, name_ar, sort_order, is_hidden, deleted_at";
const ITEM_COLUMNS =
  "id, restaurant_id, category_id, name_en, name_ar, description_en, description_ar, price_fils, sort_order, is_hidden, is_sold_out, deleted_at";

// ─── Mappers ────────────────────────────────────────────────────────────

export function toCategory(row: CategoryRow): MenuCategory {
  return {
    id: row.id as CategoryId,
    restaurantId: row.restaurant_id as RestaurantId,
    name: { en: row.name_en, ar: row.name_ar },
    sortOrder: row.sort_order,
    isHidden: row.is_hidden,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export function toItem(row: ItemRow): MenuItem {
  return {
    id: row.id as MenuItemId,
    restaurantId: row.restaurant_id as RestaurantId,
    categoryId: row.category_id as CategoryId,
    name: { en: row.name_en, ar: row.name_ar },
    description: { en: row.description_en, ar: row.description_ar },
    // bigint column; menu prices are capped far below 2^53, so a JS number is exact.
    priceFils: Number(row.price_fils) as Fils,
    sortOrder: row.sort_order,
    isHidden: row.is_hidden,
    isSoldOut: row.is_sold_out,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

/** Only the columns staff are allowed to UPDATE (see the menu migration's column grants). */
function editableCategoryColumns(c: MenuCategory) {
  return {
    name_en: c.name.en,
    name_ar: c.name.ar,
    sort_order: c.sortOrder,
    is_hidden: c.isHidden,
    deleted_at: c.deletedAt?.toISOString() ?? null,
  };
}

function editableItemColumns(i: MenuItem) {
  return {
    category_id: i.categoryId,
    name_en: i.name.en,
    name_ar: i.name.ar,
    description_en: i.description.en,
    description_ar: i.description.ar,
    price_fils: i.priceFils,
    sort_order: i.sortOrder,
    is_hidden: i.isHidden,
    is_sold_out: i.isSoldOut,
    deleted_at: i.deletedAt?.toISOString() ?? null,
  };
}

/** Ids reach us from forms/URLs; a non-UUID can't match a row and would make Postgres throw. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what} failed: ${error.message}`);
}

// ─── Adapter ────────────────────────────────────────────────────────────

/** Use with the signed-in staff user's client so RLS applies as that user. */
export class SupabaseMenuRepository implements MenuRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listCategories(restaurantId: RestaurantId): Promise<MenuCategory[]> {
    const { data, error } = await this.db
      .from("menu_categories")
      .select(CATEGORY_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at")
      .returns<CategoryRow[]>();
    if (error) fail("menu_categories list", error);
    return (data ?? []).map(toCategory);
  }

  async listItems(restaurantId: RestaurantId): Promise<MenuItem[]> {
    const { data, error } = await this.db
      .from("menu_items")
      .select(ITEM_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at")
      .returns<ItemRow[]>();
    if (error) fail("menu_items list", error);
    return (data ?? []).map(toItem);
  }

  async findCategory(restaurantId: RestaurantId, id: CategoryId): Promise<MenuCategory | null> {
    if (!UUID.test(id)) return null;
    const { data, error } = await this.db
      .from("menu_categories")
      .select(CATEGORY_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .eq("id", id)
      .maybeSingle<CategoryRow>();
    if (error) fail("menu_categories find", error);
    return data ? toCategory(data) : null;
  }

  async findItem(restaurantId: RestaurantId, id: MenuItemId): Promise<MenuItem | null> {
    if (!UUID.test(id)) return null;
    const { data, error } = await this.db
      .from("menu_items")
      .select(ITEM_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .eq("id", id)
      .maybeSingle<ItemRow>();
    if (error) fail("menu_items find", error);
    return data ? toItem(data) : null;
  }

  async insertCategory(c: MenuCategory): Promise<void> {
    const { error } = await this.db
      .from("menu_categories")
      .insert({ id: c.id, restaurant_id: c.restaurantId, ...editableCategoryColumns(c) });
    if (error) fail("menu_categories insert", error);
  }

  async updateCategory(c: MenuCategory): Promise<void> {
    const { error } = await this.db
      .from("menu_categories")
      .update(editableCategoryColumns(c))
      .eq("restaurant_id", c.restaurantId)
      .eq("id", c.id);
    if (error) fail("menu_categories update", error);
  }

  async insertItem(i: MenuItem): Promise<void> {
    const { error } = await this.db
      .from("menu_items")
      .insert({ id: i.id, restaurant_id: i.restaurantId, ...editableItemColumns(i) });
    if (error) fail("menu_items insert", error);
  }

  async updateItem(i: MenuItem): Promise<void> {
    const { error } = await this.db
      .from("menu_items")
      .update(editableItemColumns(i))
      .eq("restaurant_id", i.restaurantId)
      .eq("id", i.id);
    if (error) fail("menu_items update", error);
  }

  async setItemSoldOut(restaurantId: RestaurantId, id: MenuItemId, isSoldOut: boolean): Promise<boolean> {
    // Defense in depth: the SQL function checks the item's restaurant + role; we also make sure
    // the item belongs to the restaurant this request is for.
    if (!(await this.findItem(restaurantId, id))) return false;
    const { data, error } = await this.db.rpc("set_menu_item_sold_out", { p_item_id: id, p_sold_out: isSoldOut });
    if (error) fail("set_menu_item_sold_out", error);
    return data === true;
  }
}
