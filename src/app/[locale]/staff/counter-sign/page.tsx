import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { accentHex } from "@/domain/restaurant/branding";
import { can } from "@/domain/restaurant/role";
import { logoUrl } from "@/infrastructure/container";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { requireStaff } from "@/interface/web/staff/require-staff";
import { counterMenuUrl, offersCounterSign } from "@/interface/web/tables/counter-sign-model";
import { PrintButton } from "@/interface/web/tables/print-button";
import { QrCode } from "@/interface/web/tables/qr";
import { getScanOrigin } from "@/interface/web/tables/scan-url";

// A printable QR sign for the counter (PROJECT_SPEC.md §3.3, coffee shops): a walk-in customer scans it, orders on
// their own phone as takeout, and the order reaches the kitchen screen. Text in BOTH languages, whichever language
// the owner uses, like the table cards. Owner and manager (tables:manage), where takeout orders are taken.
export default async function CounterSignPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, staff } = await requireStaff(locale);
  if (!offersCounterSign(restaurant.settings, can(staff.role, "tables:manage"))) notFound();

  const [t, en, ar, origin] = await Promise.all([
    getTranslations("CounterSign"),
    getTranslations({ locale: "en", namespace: "CounterCard" }),
    getTranslations({ locale: "ar", namespace: "CounterCard" }),
    getScanOrigin(),
  ]);
  const url = counterMenuUrl(origin, restaurant.settings.defaultLanguage);
  const accent = accentHex(restaurant.branding.accent);

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 print:max-w-none print:p-0">
        <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <Link href={`/${locale}/staff`} className="text-sm text-gray-500 hover:text-gray-900">
              <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("back")}
            </Link>
            <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-gray-500">{t("hint")}</p>
          </div>
          <PrintButton />
        </header>

        <section
          aria-label={t("signLabel")}
          className="mx-auto flex w-full max-w-md break-inside-avoid flex-col items-center gap-4 rounded-3xl border-4 p-8 text-center"
          style={{ borderColor: accent }}
        >
          {restaurant.branding.logoPath && (
            <Image src={logoUrl(restaurant.branding.logoPath)} alt="" width={72} height={72} unoptimized className="size-18 object-contain" />
          )}
          <p className="text-xl font-semibold">
            {restaurant.name.en} <span className="text-gray-400">·</span> <span lang="ar" dir="rtl">{restaurant.name.ar}</span>
          </p>
          <p className="text-3xl font-bold" style={{ color: accent }}>
            <span lang="ar" dir="rtl" className="block">{ar("title")}</span>
            <span className="block">{en("title")}</span>
          </p>
          <QrCode text={url} label={en("qrLabel")} className="size-72" />
          <p className="text-base">
            <span lang="ar" dir="rtl" className="block">{ar("how")}</span>
            <span className="block text-gray-600">{en("how")}</span>
          </p>
          {/* The address under the code, for a phone that does not read QR codes (always left to right). */}
          <p className="break-all text-sm text-gray-500" dir="ltr">
            {url}
          </p>
        </section>
      </div>
    </main>
  );
}
