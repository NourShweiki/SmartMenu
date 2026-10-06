import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { StaffMenu } from "@/application/use-cases/menu/get-staff-menu";
import type { PublicRestaurant } from "@/application/ports/restaurant-repository";
import { localized } from "@/domain/shared/localized";
import { menu } from "@/infrastructure/container";
import type { Locale } from "@/interface/web/i18n/locales";
import { requireStaff } from "./require-staff";

/** Loads the menu for the add/edit item pages; only roles with menu:manage get past here. */
export async function loadMenuForEditing(
  locale: Locale,
): Promise<{ restaurant: PublicRestaurant; staffMenu: StaffMenu }> {
  const { restaurant, staff } = await requireStaff(locale);
  const staffMenu = await menu.getStaffMenu({ restaurantId: staff.restaurantId, role: staff.role });
  if (!staffMenu.canManage) notFound();
  return { restaurant, staffMenu };
}

export async function ItemFormShell({
  locale,
  restaurant,
  title,
  children,
}: {
  locale: Locale;
  restaurant: PublicRestaurant;
  title: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations("ItemForm");
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <header>
          <Link href={`/${locale}/staff/menu`} className="text-sm text-gray-500 hover:text-gray-900">
            <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("backToMenu")}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-gray-500">{localized(restaurant.name, locale)}</p>
        </header>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">{children}</div>
      </div>
    </main>
  );
}

export function categoryOptions(staffMenu: StaffMenu, locale: Locale) {
  return staffMenu.sections.map(({ category }) => ({ id: category.id, label: localized(category.name, locale) }));
}
