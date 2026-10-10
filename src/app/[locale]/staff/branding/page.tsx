import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@/domain/restaurant/role";
import { localized } from "@/domain/shared/localized";
import { branding, logoUrl } from "@/infrastructure/container";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { removeLogoAction, saveBrandingAction, uploadLogoAction } from "@/interface/web/staff/branding-actions";
import { valuesFromRecord } from "@/interface/web/staff/branding-form-model";
import { BrandingForm } from "@/interface/web/staff/branding-form";
import { PhotoUploader } from "@/interface/web/staff/photo-uploader";
import { requireStaff } from "@/interface/web/staff/require-staff";

// Owner-only: logo, accent colour and written details (permission `restaurant:settings`).
export default async function BrandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, staff } = await requireStaff(locale);
  if (!can(staff.role, "restaurant:settings")) notFound();

  const current = await branding.get({ restaurantId: staff.restaurantId, role: staff.role });
  if (!current.ok) notFound();
  const t = await getTranslations("Branding");
  const logo = current.value.branding.logoPath;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <header>
          <Link href={`/${locale}/staff`} className="text-sm text-gray-500 hover:text-gray-900">
            <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("backToDashboard")}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-gray-500">{localized(restaurant.name, locale)}</p>
        </header>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <PhotoUploader
            namespace="Logo"
            fit="contain"
            imageUrl={logo ? logoUrl(logo) : null}
            alt={t("logoAlt", { name: localized(current.value.name, locale) })}
            upload={uploadLogoAction.bind(null, locale)}
            remove={removeLogoAction.bind(null, locale)}
          />
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <BrandingForm action={saveBrandingAction.bind(null, locale)} initial={valuesFromRecord(current.value)} />
        </div>
      </div>
    </main>
  );
}
