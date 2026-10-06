import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { toFils, type Fils } from "@/domain/shared/money";
import { err, ok, type LocalizedText, type Result } from "@/domain/shared/result";

export type CategoryId = string & { readonly __brand: "CategoryId" };
export type MenuItemId = string & { readonly __brand: "MenuItemId" };

export type MenuCategory = {
  readonly id: CategoryId;
  readonly restaurantId: RestaurantId;
  readonly name: LocalizedText;
  readonly sortOrder: number;
  /** Hidden categories (and all their items) are not shown to customers. */
  readonly isHidden: boolean;
  /** Soft delete: old orders keep referring to it (data-model skill §6). */
  readonly deletedAt: Date | null;
};

export type MenuItem = {
  readonly id: MenuItemId;
  readonly restaurantId: RestaurantId;
  readonly categoryId: CategoryId;
  readonly name: LocalizedText;
  /** Optional; either language may be empty. */
  readonly description: LocalizedText;
  readonly priceFils: Fils;
  readonly sortOrder: number;
  /** Owner hid it: customers don't see it at all. */
  readonly isHidden: boolean;
  /** Ran out today: customers still see it, but can't order it. */
  readonly isSoldOut: boolean;
  readonly deletedAt: Date | null;
};

export type MenuError =
  | { type: "NAME_REQUIRED"; lang: "en" | "ar" }
  | { type: "NAME_TOO_LONG"; lang: "en" | "ar" }
  | { type: "DESCRIPTION_TOO_LONG"; lang: "en" | "ar" }
  | { type: "INVALID_PRICE" }
  | { type: "INVALID_SORT_ORDER" }
  | { type: "CATEGORY_NOT_FOUND" }
  | { type: "DELETED" };

export const MAX_NAME_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 500;

/** Ids are injected so the domain stays pure and testable; times are passed in. */
export type MenuDeps = { newId: () => string };

// ─── Validation ─────────────────────────────────────────────────────────

const LANGS = ["en", "ar"] as const;

function validateName(name: LocalizedText): Result<LocalizedText, MenuError> {
  const clean = { en: name.en.trim(), ar: name.ar.trim() };
  for (const lang of LANGS) {
    if (!clean[lang]) return err({ type: "NAME_REQUIRED", lang });
    if (clean[lang].length > MAX_NAME_LENGTH) return err({ type: "NAME_TOO_LONG", lang });
  }
  return ok(clean);
}

function validateDescription(description: LocalizedText): Result<LocalizedText, MenuError> {
  const clean = { en: description.en.trim(), ar: description.ar.trim() };
  for (const lang of LANGS) {
    if (clean[lang].length > MAX_DESCRIPTION_LENGTH) return err({ type: "DESCRIPTION_TOO_LONG", lang });
  }
  return ok(clean);
}

function validateSortOrder(n: number): Result<number, MenuError> {
  return Number.isSafeInteger(n) && n >= 0 ? ok(n) : err({ type: "INVALID_SORT_ORDER" });
}

function validatePrice(fils: number): Result<Fils, MenuError> {
  const price = toFils(fils);
  return price.ok ? price : err({ type: "INVALID_PRICE" });
}

// ─── Categories ─────────────────────────────────────────────────────────

export type CategoryInput = { name: LocalizedText; sortOrder: number };

export function createCategory(
  restaurantId: RestaurantId,
  input: CategoryInput,
  deps: MenuDeps,
): Result<MenuCategory, MenuError> {
  const name = validateName(input.name);
  if (!name.ok) return name;
  const sortOrder = validateSortOrder(input.sortOrder);
  if (!sortOrder.ok) return sortOrder;
  return ok({
    id: deps.newId() as CategoryId,
    restaurantId,
    name: name.value,
    sortOrder: sortOrder.value,
    isHidden: false,
    deletedAt: null,
  });
}

export function updateCategory(category: MenuCategory, input: CategoryInput): Result<MenuCategory, MenuError> {
  if (category.deletedAt) return err({ type: "DELETED" });
  const name = validateName(input.name);
  if (!name.ok) return name;
  const sortOrder = validateSortOrder(input.sortOrder);
  if (!sortOrder.ok) return sortOrder;
  return ok({ ...category, name: name.value, sortOrder: sortOrder.value });
}

export function setCategoryHidden(category: MenuCategory, isHidden: boolean): Result<MenuCategory, MenuError> {
  if (category.deletedAt) return err({ type: "DELETED" });
  return ok({ ...category, isHidden });
}

/** Soft delete. The use case decides what happens to its items (see deleteCategory use case). */
export function deleteCategory(category: MenuCategory, now: Date): Result<MenuCategory, MenuError> {
  if (category.deletedAt) return err({ type: "DELETED" });
  return ok({ ...category, deletedAt: now });
}

// ─── Items ──────────────────────────────────────────────────────────────

export type MenuItemInput = {
  name: LocalizedText;
  description: LocalizedText;
  priceFils: number;
  sortOrder: number;
};

/** An item can only go into a live category of the SAME restaurant. */
function checkCategory(restaurantId: RestaurantId, category: MenuCategory): Result<MenuCategory, MenuError> {
  return category.restaurantId === restaurantId && !category.deletedAt ? ok(category) : err({ type: "CATEGORY_NOT_FOUND" });
}

function validateItemInput(input: MenuItemInput) {
  const name = validateName(input.name);
  if (!name.ok) return name;
  const description = validateDescription(input.description);
  if (!description.ok) return description;
  const priceFils = validatePrice(input.priceFils);
  if (!priceFils.ok) return priceFils;
  const sortOrder = validateSortOrder(input.sortOrder);
  if (!sortOrder.ok) return sortOrder;
  return ok({ name: name.value, description: description.value, priceFils: priceFils.value, sortOrder: sortOrder.value });
}

export function createMenuItem(
  category: MenuCategory,
  input: MenuItemInput,
  deps: MenuDeps,
): Result<MenuItem, MenuError> {
  const fields = validateItemInput(input);
  if (!fields.ok) return fields;
  if (category.deletedAt) return err({ type: "CATEGORY_NOT_FOUND" });
  return ok({
    id: deps.newId() as MenuItemId,
    restaurantId: category.restaurantId,
    categoryId: category.id,
    ...fields.value,
    isHidden: false,
    isSoldOut: false,
    deletedAt: null,
  });
}

/** Edits name/description/price/position, optionally moving it to another category. */
export function updateMenuItem(
  item: MenuItem,
  input: MenuItemInput,
  category: MenuCategory,
): Result<MenuItem, MenuError> {
  if (item.deletedAt) return err({ type: "DELETED" });
  const target = checkCategory(item.restaurantId, category);
  if (!target.ok) return target;
  const fields = validateItemInput(input);
  if (!fields.ok) return fields;
  // Past orders are unaffected: they keep their own price snapshot (data-model skill §4).
  return ok({ ...item, categoryId: target.value.id, ...fields.value });
}

export function setItemHidden(item: MenuItem, isHidden: boolean): Result<MenuItem, MenuError> {
  return item.deletedAt ? err({ type: "DELETED" }) : ok({ ...item, isHidden });
}

export function setItemSoldOut(item: MenuItem, isSoldOut: boolean): Result<MenuItem, MenuError> {
  return item.deletedAt ? err({ type: "DELETED" }) : ok({ ...item, isSoldOut });
}

export function deleteMenuItem(item: MenuItem, now: Date): Result<MenuItem, MenuError> {
  return item.deletedAt ? err({ type: "DELETED" }) : ok({ ...item, deletedAt: now });
}

// ─── What customers see ─────────────────────────────────────────────────

/** Shown on the customer menu (sold-out items are shown, marked as unavailable). */
export function isVisibleToCustomers(item: MenuItem, category: MenuCategory): boolean {
  return !item.deletedAt && !item.isHidden && !category.deletedAt && !category.isHidden && item.categoryId === category.id;
}

/** Can be added to an order right now. */
export function isOrderable(item: MenuItem, category: MenuCategory): boolean {
  return isVisibleToCustomers(item, category) && !item.isSoldOut;
}
