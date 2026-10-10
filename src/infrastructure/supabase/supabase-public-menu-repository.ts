import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicMenuRepository, PublicMenuSection } from "@/application/ports/public-menu-repository";
import type { CategoryId, MenuItemId } from "@/domain/menu/menu";
import type { OptionGroupId, OptionId } from "@/domain/menu/options";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Fils } from "@/domain/shared/money";

// Shapes of public.get_public_menu(slug) (migration 20261010170000). Read defensively: anything that is not the
// expected shape becomes "nothing" instead of breaking the public page.
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.map(obj) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function toPublicMenu(restaurantId: RestaurantId, json: unknown): PublicMenuSection[] {
  return list(json).flatMap((c): PublicMenuSection[] => {
    const categoryId = str(c.id);
    if (!categoryId) return [];
    const category = {
      id: categoryId as CategoryId,
      restaurantId,
      name: { en: str(c.name_en), ar: str(c.name_ar) },
      sortOrder: int(c.sort_order),
      isHidden: false, // the database only returns visible categories
      deletedAt: null,
    };
    const items = list(c.items).flatMap((i) => {
      const itemId = str(i.id);
      if (!itemId) return [];
      return [
        {
          item: {
            id: itemId as MenuItemId,
            restaurantId,
            categoryId: category.id,
            name: { en: str(i.name_en), ar: str(i.name_ar) },
            description: { en: str(i.description_en), ar: str(i.description_ar) },
            priceFils: int(i.price_fils) as Fils,
            sortOrder: int(i.sort_order),
            isHidden: false,
            isSoldOut: i.is_sold_out === true,
            imagePath: typeof i.image_path === "string" && i.image_path !== "" ? i.image_path : null,
            deletedAt: null,
          },
          groups: list(i.option_groups).flatMap((g) => {
            const groupId = str(g.id);
            if (!groupId) return [];
            const group = {
              id: groupId as OptionGroupId,
              restaurantId,
              name: { en: str(g.name_en), ar: str(g.name_ar) },
              minSelect: int(g.min_select),
              maxSelect: Math.max(1, int(g.max_select)),
              sortOrder: int(g.sort_order),
              deletedAt: null,
            };
            const options = list(g.options).flatMap((o) =>
              str(o.id)
                ? [
                    {
                      id: str(o.id) as OptionId,
                      restaurantId,
                      groupId: group.id,
                      name: { en: str(o.name_en), ar: str(o.name_ar) },
                      priceDeltaFils: int(o.price_delta_fils) as Fils,
                      sortOrder: int(o.sort_order),
                      deletedAt: null,
                    },
                  ]
                : [],
            );
            return [{ group, options }];
          }),
        },
      ];
    });
    return [{ category, items }];
  });
}

export class SupabasePublicMenuRepository implements PublicMenuRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findForRestaurant(restaurant: { id: RestaurantId; slug: string }): Promise<PublicMenuSection[]> {
    const { data, error } = await this.db.rpc("get_public_menu", { p_slug: restaurant.slug });
    if (error) throw new Error(`get_public_menu failed: ${error.message}`);
    return toPublicMenu(restaurant.id, data);
  }
}
