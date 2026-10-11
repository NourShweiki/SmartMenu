import type { MenuRepository } from "@/application/ports/menu-repository";
import type { IdGenerator } from "@/application/ports/system";
import { createCategory, createMenuItem, type MenuCategory, type MenuError, type MenuItem } from "@/domain/menu/menu";
import { err, ok, type LocalizedText, type Result } from "@/domain/shared/result";
import { requirePermission, type MenuActor } from "./shared";
import type { ForbiddenError } from "../permissions";

/** One line of an imported menu (from a spreadsheet, or drafted by AI from a photo): an item and the category it goes into. */
export type MenuImportRow = {
  readonly category: LocalizedText;
  readonly name: LocalizedText;
  readonly description: LocalizedText;
  readonly priceFils: number;
};

/** More than this is not a menu a restaurant types up in one go; it keeps one request small. */
export const MAX_IMPORT_ROWS = 300;

export type MenuImportResult = { categoriesAdded: number; itemsAdded: number; itemsSkipped: number };

export type MenuImportError =
  | ForbiddenError
  | { type: "EMPTY_IMPORT" }
  | { type: "TOO_MANY_ROWS"; max: number }
  /** `row` counts from 1, in the order the rows were given. */
  | { type: "ROW_INVALID"; row: number; error: MenuError };

const key = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Adds many items to the menu at once. Categories are matched by their English name (ignoring case and spacing):
 * one that exists is used, one that does not is created, after the existing ones. Items go to the end of their
 * category, in the order of the rows.
 *
 * An item that is already in its category (same English name) is SKIPPED, not duplicated and not changed: so the
 * same file can be imported twice, and an import that broke off half-way can simply be run again.
 *
 * Every row is checked by the same domain rules as the "add item" form BEFORE anything is written: one bad row
 * refuses the whole import and names the row.
 */
export function makeImportMenu(deps: { menu: MenuRepository; ids: IdGenerator }) {
  return async (actor: MenuActor, rows: readonly MenuImportRow[]): Promise<Result<MenuImportResult, MenuImportError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;
    if (rows.length === 0) return err({ type: "EMPTY_IMPORT" });
    if (rows.length > MAX_IMPORT_ROWS) return err({ type: "TOO_MANY_ROWS", max: MAX_IMPORT_ROWS });

    const [existingCategories, existingItems] = await Promise.all([deps.menu.listCategories(actor.restaurantId), deps.menu.listItems(actor.restaurantId)]);
    const ids = { newId: () => deps.ids.newId() };

    const categories = new Map(existingCategories.map((c) => [key(c.name.en), c]));
    let nextCategoryOrder = existingCategories.reduce((max, c) => Math.max(max, c.sortOrder + 1), 0);
    // Per category: the English names already in it, and where the next item goes.
    const taken = new Map<string, Set<string>>();
    const nextItemOrder = new Map<string, number>();
    for (const item of existingItems) {
      if (!taken.has(item.categoryId)) taken.set(item.categoryId, new Set());
      taken.get(item.categoryId)!.add(key(item.name.en));
      nextItemOrder.set(item.categoryId, Math.max(nextItemOrder.get(item.categoryId) ?? 0, item.sortOrder + 1));
    }

    const newCategories: MenuCategory[] = [];
    const newItems: MenuItem[] = [];
    let itemsSkipped = 0;

    for (const [index, row] of rows.entries()) {
      const invalid = (error: MenuError) => err({ type: "ROW_INVALID" as const, row: index + 1, error });

      let category = categories.get(key(row.category.en));
      if (!category) {
        const created = createCategory(actor.restaurantId, { name: row.category, sortOrder: nextCategoryOrder }, ids);
        if (!created.ok) return invalid(created.error);
        category = created.value;
        categories.set(key(category.name.en), category);
        newCategories.push(category);
        nextCategoryOrder++;
      }

      const names = taken.get(category.id) ?? new Set<string>();
      taken.set(category.id, names);
      const sortOrder = nextItemOrder.get(category.id) ?? 0;
      // Checked even when it will be skipped: a row with a bad price is a mistake in the file either way.
      const item = createMenuItem(category, { name: row.name, description: row.description, priceFils: row.priceFils, sortOrder }, ids);
      if (!item.ok) return invalid(item.error);
      if (names.has(key(item.value.name.en))) {
        itemsSkipped++;
        continue;
      }
      names.add(key(item.value.name.en));
      nextItemOrder.set(category.id, sortOrder + 1);
      newItems.push(item.value);
    }

    // Everything is valid: write it. Categories first (an item needs its category to exist).
    for (const category of newCategories) await deps.menu.insertCategory(category);
    for (const item of newItems) await deps.menu.insertItem(item);
    return ok({ categoriesAdded: newCategories.length, itemsAdded: newItems.length, itemsSkipped });
  };
}
