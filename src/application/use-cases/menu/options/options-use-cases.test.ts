import { describe, expect, it } from "vitest";
import type { MenuRepository } from "@/application/ports/menu-repository";
import type { ItemGroupLink, OptionsRepository } from "@/application/ports/options-repository";
import type { MenuItem, MenuItemId } from "@/domain/menu/menu";
import type { MenuOption, OptionGroup, OptionGroupId, OptionId } from "@/domain/menu/options";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import { makeAddOption } from "./add-option";
import { makeAddOptionGroup } from "./add-option-group";
import { makeDeleteOption } from "./delete-option";
import { makeDeleteOptionGroup } from "./delete-option-group";
import { makeEditOption } from "./edit-option";
import { makeEditOptionGroup } from "./edit-option-group";
import { makeGetOptionGroups } from "./get-option-groups";
import { makeSetItemOptionGroups } from "./set-item-option-groups";

const GRILL = "grill" as RestaurantId;
const COFFEE = "coffee" as RestaurantId;
const NOW = new Date("2026-10-06T12:00:00Z");

/** In-memory fakes that, like RLS, never cross restaurants. */
function fakes() {
  const group = (id: string, restaurantId: RestaurantId): OptionGroup => ({
    id: id as OptionGroupId,
    restaurantId,
    name: { en: id, ar: id },
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 0,
    deletedAt: null,
  });
  const state = {
    groups: [group("size", GRILL), group("extras", GRILL), group("milk", COFFEE)],
    options: [] as MenuOption[],
    links: [{ itemId: "kebab" as MenuItemId, groupId: "size" as OptionGroupId, sortOrder: 0 }] as ItemGroupLink[],
  };
  const items = [{ id: "kebab", restaurantId: GRILL, deletedAt: null }, { id: "latte", restaurantId: COFFEE, deletedAt: null }];

  const options: OptionsRepository = {
    async listGroups(r) { return state.groups.filter((g) => g.restaurantId === r && !g.deletedAt); },
    async listOptions(r) { return state.options.filter((o) => o.restaurantId === r && !o.deletedAt); },
    async findGroup(r, id) { return state.groups.find((g) => g.restaurantId === r && g.id === id) ?? null; },
    async findOption(r, id) { return state.options.find((o) => o.restaurantId === r && o.id === id) ?? null; },
    async insertGroup(g) { state.groups.push(g); },
    async updateGroup(g) { state.groups = state.groups.map((x) => (x.id === g.id ? g : x)); },
    async insertOption(o) { state.options.push(o); },
    async updateOption(o) { state.options = state.options.map((x) => (x.id === o.id ? o : x)); },
    async listLinks(r) {
      const mine = new Set(state.groups.filter((g) => g.restaurantId === r).map((g) => g.id));
      return state.links.filter((l) => mine.has(l.groupId));
    },
    async setItemGroups(_r, itemId, groupIds) {
      state.links = [...state.links.filter((l) => l.itemId !== itemId), ...groupIds.map((groupId, sortOrder) => ({ itemId, groupId, sortOrder }))];
    },
    async detachGroupFromAllItems(_r, groupId) { state.links = state.links.filter((l) => l.groupId !== groupId); },
  };
  const menu = {
    async findItem(r: RestaurantId, id: MenuItemId) {
      return (items.find((i) => i.restaurantId === r && i.id === id) as unknown as MenuItem) ?? null;
    },
  } as MenuRepository;
  let n = 0;
  return { state, options, menu, ids: { newId: () => `new-${++n}` }, clock: { now: () => NOW } };
}

const actor = (role: Role, restaurantId = GRILL) => ({ restaurantId, role });
const sizeInput = { name: { en: "Size", ar: "الحجم" }, minSelect: 1, maxSelect: 1, sortOrder: 0 };

describe("option groups", () => {
  it("lists only the actor's restaurant groups, with their options and items", async () => {
    const d = fakes();
    await makeAddOption(d)(actor("OWNER"), { groupId: "size" as OptionGroupId, name: { en: "Large", ar: "كبير" }, priceDeltaFils: 1000, sortOrder: 0 });
    const view = await makeGetOptionGroups(d)(actor("WAITER"));
    expect(view.canManage).toBe(false);
    expect(view.groups.map((g) => [g.group.id, g.options.length, g.itemIds])).toEqual([
      ["size", 1, ["kebab"]],
      ["extras", 0, []],
    ]);
  });

  it("lets owner/manager create and edit groups, not waiters", async () => {
    const d = fakes();
    const added = await makeAddOptionGroup(d)(actor("MANAGER"), sizeInput);
    expect(added.ok && added.value.restaurantId).toBe(GRILL);
    expect(await makeAddOptionGroup(d)(actor("WAITER"), sizeInput)).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(await makeEditOptionGroup(d)(actor("OWNER"), { ...sizeInput, minSelect: 2, maxSelect: 1, groupId: "size" as OptionGroupId }))
      .toEqual({ ok: false, error: { type: "INVALID_SELECTION_RULE" } });
  });

  it("deleting a group detaches it from all items", async () => {
    const d = fakes();
    const result = await makeDeleteOptionGroup(d)(actor("OWNER"), { groupId: "size" as OptionGroupId });
    expect(result.ok && result.value.deletedAt).toEqual(NOW);
    expect(d.state.links).toEqual([]);
  });

  it("cannot touch another restaurant's group", async () => {
    const d = fakes();
    expect(await makeDeleteOptionGroup(d)(actor("OWNER"), { groupId: "milk" as OptionGroupId })).toEqual({
      ok: false,
      error: { type: "GROUP_NOT_FOUND" },
    });
    expect(
      await makeAddOption(d)(actor("OWNER"), { groupId: "milk" as OptionGroupId, name: { en: "X", ar: "س" }, priceDeltaFils: 0, sortOrder: 0 }),
    ).toEqual({ ok: false, error: { type: "GROUP_NOT_FOUND" } });
  });
});

describe("options", () => {
  it("adds, edits and soft-deletes an option", async () => {
    const d = fakes();
    const added = await makeAddOption(d)(actor("OWNER"), { groupId: "size" as OptionGroupId, name: { en: "Large", ar: "كبير" }, priceDeltaFils: 1000, sortOrder: 0 });
    if (!added.ok) throw new Error();
    const edited = await makeEditOption(d)(actor("OWNER"), { optionId: added.value.id, name: { en: "XL", ar: "كبير جدًا" }, priceDeltaFils: 1500, sortOrder: 0 });
    expect(edited.ok && edited.value.priceDeltaFils).toBe(1500);
    const deleted = await makeDeleteOption(d)(actor("OWNER"), { optionId: added.value.id });
    expect(deleted.ok && deleted.value.deletedAt).toEqual(NOW);
    expect(await makeEditOption(d)(actor("OWNER"), { optionId: "nope" as OptionId, name: { en: "A", ar: "أ" }, priceDeltaFils: 0, sortOrder: 0 }))
      .toEqual({ ok: false, error: { type: "OPTION_NOT_FOUND" } });
  });
});

describe("attaching groups to items", () => {
  it("sets an item's groups in order", async () => {
    const d = fakes();
    const ids = ["extras", "size"] as OptionGroupId[];
    expect(await makeSetItemOptionGroups(d)(actor("OWNER"), { itemId: "kebab" as MenuItemId, groupIds: ids })).toEqual({ ok: true, value: true });
    expect(d.state.links.map((l) => [l.groupId, l.sortOrder])).toEqual([["extras", 0], ["size", 1]]);
  });

  it("refuses another restaurant's group or item, and waiters", async () => {
    const d = fakes();
    expect(await makeSetItemOptionGroups(d)(actor("OWNER"), { itemId: "kebab" as MenuItemId, groupIds: ["milk" as OptionGroupId] }))
      .toEqual({ ok: false, error: { type: "GROUP_NOT_FOUND" } });
    expect(await makeSetItemOptionGroups(d)(actor("OWNER"), { itemId: "latte" as MenuItemId, groupIds: [] }))
      .toEqual({ ok: false, error: { type: "ITEM_NOT_FOUND" } });
    expect(await makeSetItemOptionGroups(d)(actor("WAITER"), { itemId: "kebab" as MenuItemId, groupIds: [] }))
      .toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(d.state.links).toHaveLength(1);
  });
});
