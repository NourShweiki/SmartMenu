import { describe, expect, it } from "vitest";
import type { BrandingRecord } from "@/application/ports/branding-repository";
import type { StaffMember } from "@/application/ports/staff-repository";
import type { UserId } from "@/application/ports/auth-gateway";
import { createCategory, createMenuItem, setItemSoldOut, type MenuCategory, type MenuItem } from "@/domain/menu/menu";
import { DEFAULT_BRANDING } from "@/domain/restaurant/branding";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import { createTable, setTableActive, type Table } from "@/domain/table-session/table-session";
import { makeGetSetupChecklist } from "./get-setup-checklist";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
let n = 0;
const ids = { newId: () => `id-${++n}` };
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

const category = unwrap(createCategory(R, { name: { en: "Grill", ar: "مشاوي" }, sortOrder: 0 }, ids));
const item = (name: string) => unwrap(createMenuItem(category, { name: { en: name, ar: name }, description: { en: "", ar: "" }, priceFils: 1000, sortOrder: 0 }, ids));
const table = (label: string) => unwrap(createTable(R, label, { newId: ids.newId, newToken: () => "token-token-token-token-0001" }, new Date()));
const member = (role: Role): StaffMember => ({ userId: `user-${role}` as UserId, role, email: `${role}@test`, joinedAt: new Date() });

function world(has: { categories?: MenuCategory[]; items?: MenuItem[]; tables?: Table[]; branding?: BrandingRecord | null; staff?: StaffMember[]; orders?: boolean } = {}) {
  const asked = { tables: 0 };
  const get = makeGetSetupChecklist({
    menu: { listCategories: async () => has.categories ?? [category], listItems: async () => has.items ?? [] },
    tables: {
      list: async () => {
        asked.tables++;
        return has.tables ?? [];
      },
    },
    branding: { find: async () => (has.branding === undefined ? { name: { en: "R", ar: "م" }, branding: DEFAULT_BRANDING } : has.branding) },
    staff: { list: async () => has.staff ?? [member("OWNER")] },
    orders: { hasAny: async () => has.orders ?? false },
  });
  return { get, asked };
}
const owner = { restaurantId: R, role: "OWNER" } as const;
const lines = (checklist: { items: readonly { id: string; done: boolean }[] }) => Object.fromEntries(checklist.items.map((i) => [i.id, i.done]));

describe("getSetupChecklist", () => {
  it("a new restaurant: nothing is done", async () => {
    const result = await world().get(owner, { dineInEnabled: true });
    expect(result.ok && lines(result.value)).toEqual({ menu: false, tables: false, branding: false, staff: false, testOrder: false });
    expect(result.ok && result.value.ready).toBe(false);
  });

  it("counts only what really works: an orderable item, a table whose code is active, written details, staff who are not owners", async () => {
    const soldOut = unwrap(setItemSoldOut(item("Kebab"), true));
    const off = unwrap(setTableActive(table("9"), false));
    const half = await world({ items: [soldOut], tables: [off], staff: [member("OWNER"), member("OWNER")] }).get(owner, { dineInEnabled: true });
    expect(half.ok && lines(half.value)).toMatchObject({ menu: false, tables: false, staff: false });

    const full = await world({
      items: [soldOut, item("Hummus")],
      tables: [off, table("1")],
      branding: { name: { en: "R", ar: "م" }, branding: { ...DEFAULT_BRANDING, phone: " +962 6 555 0100 " } },
      staff: [member("OWNER"), member("WAITER")],
      orders: true,
    }).get(owner, { dineInEnabled: true });
    expect(full.ok && lines(full.value)).toEqual({ menu: true, tables: true, branding: true, staff: true, testOrder: true });
    expect(full.ok && full.value.ready).toBe(true);
  });

  it("an item in a hidden category does not count", async () => {
    const hidden = { ...category, isHidden: true };
    const result = await world({ categories: [hidden], items: [item("Kebab")] }).get(owner, { dineInEnabled: false });
    expect(result.ok && lines(result.value).menu).toBe(false);
  });

  it("a takeout-only restaurant has no tables line, and the tables are not even read", async () => {
    const { get, asked } = world({ items: [item("Coffee")], branding: { name: { en: "R", ar: "م" }, branding: { ...DEFAULT_BRANDING, logoPath: "r/logo.png" } }, orders: true });
    const result = await get(owner, { dineInEnabled: false });
    expect(result.ok && lines(result.value)).toEqual({ menu: true, branding: true, staff: false, testOrder: true });
    expect(result.ok && result.value.ready).toBe(true); // staff is optional
    expect(asked.tables).toBe(0);
  });

  it("is the owner's list only", async () => {
    for (const role of ["MANAGER", "WAITER", "CASHIER"] as const) {
      expect(await world().get({ restaurantId: R, role }, { dineInEnabled: true })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    }
  });
});
