import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@/domain/restaurant/role";
import { localized } from "@/domain/shared/localized";
import { settings } from "@/infrastructure/container";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { bpToRateInput } from "@/interface/web/rate-input";
import { requireStaff } from "@/interface/web/staff/require-staff";
import { saveSettingsAction } from "@/interface/web/staff/settings-actions";
import { SettingsForm } from "@/interface/web/staff/settings-form";

// Owner-only: order modes, tax, service charge, default language (permission `restaurant:settings`).
export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, staff } = await requireStaff(locale);
  if (!can(staff.role, "restaurant:settings")) notFound();

  const current = await settings.get({ restaurantId: staff.restaurantId, role: staff.role });
  if (!current.ok) notFound();
  const t = await getTranslations("Settings");

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <header>
          <Link href={`/${locale}/staff`} className="text-sm text-gray-500 hover:text-gray-900">
            <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("backToDashboard")}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-gray-500">{localized(restaurant.name, locale)}</p>
        </header>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <SettingsForm
            action={saveSettingsAction.bind(null, locale)}
            initial={{
              dineInEnabled: current.value.dineInEnabled,
              takeoutEnabled: current.value.takeoutEnabled,
              deliveryEnabled: current.value.deliveryEnabled,
              taxPercent: bpToRateInput(current.value.taxRateBp),
              servicePercent: bpToRateInput(current.value.serviceChargeBp),
              defaultLanguage: current.value.defaultLanguage,
            }}
          />
        </div>
      </div>
    </main>
  );
}
