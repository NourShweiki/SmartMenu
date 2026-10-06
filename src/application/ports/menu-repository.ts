import type { CategoryId, MenuCategory, MenuItem, MenuItemId } from "@/domain/menu/menu";
import type { RestaurantId } from "@/domain/restaurant/restaurant";

/**
 * Staff-side menu storage, always scoped to one restaurant (RLS enforces it too).
 * Lists exclude soft-deleted rows and are ordered by sortOrder.
 */
export interface MenuRepository {
  listCategories(restaurantId: RestaurantId): Promise<MenuCategory[]>;
  listItems(restaurantId: RestaurantId): Promise<MenuItem[]>;
  findCategory(restaurantId: RestaurantId, id: CategoryId): Promise<MenuCategory | null>;
  findItem(restaurantId: RestaurantId, id: MenuItemId): Promise<MenuItem | null>;

  insertCategory(category: MenuCategory): Promise<void>;
  /** Saves the editable fields (name, order, hidden, deletedAt). */
  updateCategory(category: MenuCategory): Promise<void>;
  insertItem(item: MenuItem): Promise<void>;
  /** Saves the editable fields (category, texts, price, order, hidden, sold out, deletedAt). */
  updateItem(item: MenuItem): Promise<void>;

  /** Sold-out toggle that waiters may also use. False if the item was not found / not allowed. */
  setItemSoldOut(restaurantId: RestaurantId, id: MenuItemId, isSoldOut: boolean): Promise<boolean>;
}
