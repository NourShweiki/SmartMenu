import { describe, expect, it } from "vitest";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { toPublicMenu } from "./supabase-public-menu-repository";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;

// What public.get_public_menu returns (see the pgTAP test public_menu.test.sql for the pinned keys).
const json = [
  {
    id: "cat-1",
    name_en: "Grills",
    name_ar: "مشاوي",
    sort_order: 0,
    items: [
      {
        id: "item-1",
        name_en: "Kebab",
        name_ar: "كباب",
        description_en: "Grilled",
        description_ar: "مشوي",
        price_fils: 4500,
        sort_order: 0,
        is_sold_out: false,
        image_path: `${R}/item-1/p.jpg`,
        option_groups: [
          {
            id: "g-1",
            name_en: "Size",
            name_ar: "الحجم",
            min_select: 1,
            max_select: 1,
            sort_order: 0,
            options: [
              { id: "o-1", name_en: "Small", name_ar: "صغير", price_delta_fils: 0, sort_order: 0 },
              { id: "o-2", name_en: "Large", name_ar: "كبير", price_delta_fils: 500, sort_order: 1 },
            ],
          },
        ],
      },
      {
        id: "item-2",
        name_en: "Tawook",
        name_ar: "طاووق",
        description_en: "",
        description_ar: "",
        price_fils: 4000,
        sort_order: 1,
        is_sold_out: true,
        image_path: null,
        option_groups: [],
      },
    ],
  },
];

describe("toPublicMenu", () => {
  const [section] = toPublicMenu(R, json);

  it("maps categories, items, option groups and options to the domain types", () => {
    expect(section!.category).toEqual({
      id: "cat-1",
      restaurantId: R,
      name: { en: "Grills", ar: "مشاوي" },
      sortOrder: 0,
      isHidden: false,
      deletedAt: null,
    });
    const [kebab, tawook] = section!.items;
    expect(kebab!.item).toMatchObject({
      id: "item-1",
      categoryId: "cat-1",
      restaurantId: R,
      name: { en: "Kebab", ar: "كباب" },
      description: { en: "Grilled", ar: "مشوي" },
      priceFils: 4500,
      isSoldOut: false,
      isHidden: false,
      deletedAt: null,
      imagePath: `${R}/item-1/p.jpg`,
    });
    expect(kebab!.groups[0]!.group).toMatchObject({ id: "g-1", minSelect: 1, maxSelect: 1, name: { en: "Size", ar: "الحجم" } });
    expect(kebab!.groups[0]!.options.map((o) => [o.name.en, o.priceDeltaFils, o.groupId])).toEqual([
      ["Small", 0, "g-1"],
      ["Large", 500, "g-1"],
    ]);
    expect(tawook!.item).toMatchObject({ isSoldOut: true, imagePath: null });
  });

  it("returns nothing for an empty or odd response instead of throwing", () => {
    for (const odd of [null, undefined, [], {}, "x", 5, [null], [{}], [{ id: "" }], [[]]]) {
      expect(toPublicMenu(R, odd)).toEqual([]);
    }
  });

  it("skips entries without an id and tolerates missing fields", () => {
    const partial = toPublicMenu(R, [
      { id: "c", items: [{ id: "" }, { id: "i", option_groups: [{ id: "" }, { id: "g", options: [{ id: "" }, { id: "o" }] }] }] },
    ]);
    expect(partial).toHaveLength(1);
    const [entry] = partial[0]!.items;
    expect(partial[0]!.items).toHaveLength(1);
    expect(entry!.item).toMatchObject({ name: { en: "", ar: "" }, priceFils: 0, isSoldOut: false, imagePath: null });
    expect(entry!.groups).toHaveLength(1);
    expect(entry!.groups[0]!.group.maxSelect).toBeGreaterThanOrEqual(1); // never an impossible rule
    expect(entry!.groups[0]!.options.map((o) => o.id)).toEqual(["o"]);
  });
});
