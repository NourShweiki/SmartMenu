import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { PublicRestaurant } from "@/application/ports/restaurant-repository";
import type { StaffOptionGroups } from "@/application/use-cases/menu/options/get-option-groups";
import type { OptionGroup } from "@/domain/menu/options";
import { options } from "@/infrastructure/container";
import type { Locale } from "@/interface/web/i18n/locales";
import { requireStaff } from "./require-staff";

/** Loads option groups for the options pages; only roles with menu:manage get past here. */
export async function loadOptionsForEditing(
  locale: Locale,
): Promise<{ restaurant: PublicRestaurant; groups: StaffOptionGroups["groups"] }> {
  const { restaurant, staff } = await requireStaff(locale);
  const result = await options.getGroups({ restaurantId: staff.restaurantId, role: staff.role });
  if (!result.canManage) notFound();
  return { restaurant, groups: result.groups };
}

/** "Required · choose 1" / "Optional · up to 3", translated. */
export async function ruleSummaries() {
  const t = await getTranslations("Options");
  return (g: Pick<OptionGroup, "minSelect" | "maxSelect">) => {
    if (g.minSelect === 0) return t("ruleOptional", { max: g.maxSelect });
    if (g.minSelect === g.maxSelect) return t("ruleRequiredExact", { count: g.minSelect });
    return t("ruleRequiredRange", { min: g.minSelect, max: g.maxSelect });
  };
}
