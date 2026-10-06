import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Fils } from "@/domain/shared/money";
import { err, ok, type LocalizedText, type Result } from "@/domain/shared/result";
import { validateName, validatePrice, validateSortOrder, type MenuDeps, type MenuError } from "./menu";

/**
 * Reusable option groups (decided 2026-10-06): a group like "Size" or "Sauces" is created
 * once and attached to many items. Each group says how many options a customer must/may pick.
 */
export type OptionGroupId = string & { readonly __brand: "OptionGroupId" };
export type OptionId = string & { readonly __brand: "OptionId" };

export type OptionGroup = {
  readonly id: OptionGroupId;
  readonly restaurantId: RestaurantId;
  readonly name: LocalizedText;
  /** 0 = optional; 1+ = the customer must pick at least this many. */
  readonly minSelect: number;
  /** The most a customer may pick (1 = pick one). */
  readonly maxSelect: number;
  readonly sortOrder: number;
  readonly deletedAt: Date | null;
};

export type MenuOption = {
  readonly id: OptionId;
  readonly restaurantId: RestaurantId;
  readonly groupId: OptionGroupId;
  readonly name: LocalizedText;
  /** Added to the item price when picked (0 = free choice, e.g. "No onion"). */
  readonly priceDeltaFils: Fils;
  readonly sortOrder: number;
  readonly deletedAt: Date | null;
};

/** Upper bound for maxSelect — keeps forms and receipts sane. */
export const MAX_SELECT_LIMIT = 20;

export type OptionError = MenuError | { type: "INVALID_SELECTION_RULE" } | { type: "GROUP_NOT_FOUND" };

// ─── Groups ─────────────────────────────────────────────────────────────

export type OptionGroupInput = { name: LocalizedText; minSelect: number; maxSelect: number; sortOrder: number };

function validateGroupInput(input: OptionGroupInput): Result<OptionGroupInput, OptionError> {
  const name = validateName(input.name);
  if (!name.ok) return name;
  const { minSelect: min, maxSelect: max } = input;
  const whole = (n: number) => Number.isSafeInteger(n);
  if (!whole(min) || !whole(max) || min < 0 || max < 1 || min > max || max > MAX_SELECT_LIMIT) {
    return err({ type: "INVALID_SELECTION_RULE" });
  }
  const sortOrder = validateSortOrder(input.sortOrder);
  if (!sortOrder.ok) return sortOrder;
  return ok({ name: name.value, minSelect: min, maxSelect: max, sortOrder: sortOrder.value });
}

export function createOptionGroup(
  restaurantId: RestaurantId,
  input: OptionGroupInput,
  deps: MenuDeps,
): Result<OptionGroup, OptionError> {
  const fields = validateGroupInput(input);
  if (!fields.ok) return fields;
  return ok({ id: deps.newId() as OptionGroupId, restaurantId, ...fields.value, deletedAt: null });
}

export function updateOptionGroup(group: OptionGroup, input: OptionGroupInput): Result<OptionGroup, OptionError> {
  if (group.deletedAt) return err({ type: "DELETED" });
  const fields = validateGroupInput(input);
  return fields.ok ? ok({ ...group, ...fields.value }) : fields;
}

/** Soft delete. The use case also detaches it from items (nothing on the items is lost). */
export function deleteOptionGroup(group: OptionGroup, now: Date): Result<OptionGroup, OptionError> {
  return group.deletedAt ? err({ type: "DELETED" }) : ok({ ...group, deletedAt: now });
}

// ─── Options ────────────────────────────────────────────────────────────

export type OptionInput = { name: LocalizedText; priceDeltaFils: number; sortOrder: number };

function validateOptionInput(input: OptionInput) {
  const name = validateName(input.name);
  if (!name.ok) return name;
  const price = validatePrice(input.priceDeltaFils);
  if (!price.ok) return price;
  const sortOrder = validateSortOrder(input.sortOrder);
  if (!sortOrder.ok) return sortOrder;
  return ok({ name: name.value, priceDeltaFils: price.value, sortOrder: sortOrder.value });
}

export function createOption(group: OptionGroup, input: OptionInput, deps: MenuDeps): Result<MenuOption, OptionError> {
  if (group.deletedAt) return err({ type: "GROUP_NOT_FOUND" });
  const fields = validateOptionInput(input);
  if (!fields.ok) return fields;
  return ok({
    id: deps.newId() as OptionId,
    restaurantId: group.restaurantId,
    groupId: group.id,
    ...fields.value,
    deletedAt: null,
  });
}

export function updateOption(option: MenuOption, input: OptionInput): Result<MenuOption, OptionError> {
  if (option.deletedAt) return err({ type: "DELETED" });
  const fields = validateOptionInput(input);
  return fields.ok ? ok({ ...option, ...fields.value }) : fields;
}

/** Soft delete: past orders will keep a snapshot of the option name and price. */
export function deleteOption(option: MenuOption, now: Date): Result<MenuOption, OptionError> {
  return option.deletedAt ? err({ type: "DELETED" }) : ok({ ...option, deletedAt: now });
}

// ─── Ordering rules (used by the customer menu in Phase 4) ──────────────

export type SelectionError =
  | { type: "UNKNOWN_OPTION"; optionId: string }
  | { type: "TOO_FEW_OPTIONS"; min: number }
  | { type: "TOO_MANY_OPTIONS"; max: number };

/** A required group with too few live options would make its items impossible to order. */
export function isGroupOrderable(group: OptionGroup, liveOptions: MenuOption[]): boolean {
  return !group.deletedAt && liveOptions.filter((o) => !o.deletedAt && o.groupId === group.id).length >= group.minSelect;
}

/** Checks a customer's picks for one group. Duplicate ids count once. */
export function validateSelection(
  group: OptionGroup,
  options: MenuOption[],
  selectedIds: string[],
): Result<MenuOption[], SelectionError> {
  const live = new Map(options.filter((o) => o.groupId === group.id && !o.deletedAt).map((o) => [o.id as string, o]));
  const picked: MenuOption[] = [];
  for (const id of new Set(selectedIds)) {
    const option = live.get(id);
    if (!option) return err({ type: "UNKNOWN_OPTION", optionId: id });
    picked.push(option);
  }
  if (picked.length < group.minSelect) return err({ type: "TOO_FEW_OPTIONS", min: group.minSelect });
  if (picked.length > group.maxSelect) return err({ type: "TOO_MANY_OPTIONS", max: group.maxSelect });
  return ok(picked);
}

/** Item price plus the picked options, in whole fils (no rounding needed: all integers). */
export function priceWithOptions(itemPrice: Fils, picked: MenuOption[]): Fils {
  return picked.reduce((sum, o) => sum + o.priceDeltaFils, itemPrice as number) as Fils;
}
