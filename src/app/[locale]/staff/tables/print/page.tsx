import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@/domain/restaurant/role";
import { accentHex } from "@/domain/restaurant/branding";
import { tables, logoUrl } from "@/infrastructure/container";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { requireStaff } from "@/interface/web/staff/require-staff";
import { PrintButton } from "@/interface/web/tables/print-button";
import { QrCode } from "@/interface/web/tables/qr";
import { getRequestOrigin, tableScanUrl } from "@/interface/web/tables/scan-url";

// Printable QR cards: all active tables, or ONE table (?table=<id>). Text is in BOTH languages on every card,
// whichever language the owner is using, because guests of either language sit at the same table.
export default async function PrintTablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ table?: string }>;
}) {
  const locale = await initLocale(params);
  const { table: only } = await searchParams;
  const { restaurant, staff } = await requireStaff(locale);
  if (!can(staff.role, "tables:manage")) notFound();

  const list = await tables.list({ restaurantId: staff.restaurantId, role: staff.role });
  if (!list.ok) notFound();
  const [t, en, ar, origin] = await Promise.all([
    getTranslations("Tables"),
    getTranslations({ locale: "en", namespace: "TableCard" }),
    getTranslations({ locale: "ar", namespace: "TableCard" }),
    getRequestOrigin(),
  ]);

  // Only tables whose QR code works (inactive ones would print a dead code), optionally just the chosen one.
  const cards = list.value.filter((table) => table.isActive && (!only || table.id === only));
  const accent = accentHex(restaurant.branding.accent);

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 print:max-w-none print:p-0">
        <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <Link href={`/${locale}/staff/tables`} className="text-sm text-gray-500 hover:text-gray-900">
              <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("backToTables")}
            </Link>
            <h1 className="mt-1 text-2xl font-semibold">{t("printTitle")}</h1>
            <p className="text-sm text-gray-500">{t("printHint")}</p>
          </div>
          {cards.length > 0 && <PrintButton />}
        </header>

        {cards.length === 0 ? (
          <p className="py-10 text-center text-gray-500 print:hidden">{t("printNone")}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2 print:gap-4">
            {cards.map((table) => (
              <li
                key={table.id}
                className="flex break-inside-avoid flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center"
                style={{ borderColor: accent }}
              >
                {restaurant.branding.logoPath && (
                  <Image
                    src={logoUrl(restaurant.branding.logoPath)}
                    alt=""
                    width={56}
                    height={56}
                    unoptimized
                    className="size-14 object-contain"
                  />
                )}
                <p className="text-lg font-semibold">
                  {restaurant.name.en} <span className="text-gray-400">·</span> <span lang="ar" dir="rtl">{restaurant.name.ar}</span>
                </p>
                <p className="text-4xl font-bold" style={{ color: accent }}>
                  <bdi>{en("table", { label: table.label })}</bdi> <span className="text-gray-300">/</span>{" "}
                  <bdi lang="ar" dir="rtl">{ar("table", { label: table.label })}</bdi>
                </p>
                <QrCode text={tableScanUrl(origin, table.token)} label={en("qrLabel", { label: table.label })} className="size-56" />
                <p className="text-xl font-semibold">
                  {en("scan")} <span className="text-gray-300">/</span> <span lang="ar" dir="rtl">{ar("scan")}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
