import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { dirOf, LOCALES } from "@/interface/web/i18n/locales";

// Arabic-first font that also covers Latin, so both languages look consistent.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-plex-arabic",
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = await initLocale(params);
  return (
    <html lang={locale} dir={dirOf(locale)} className={plexArabic.variable}>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) add attributes to <body> before React loads;
          this silences only attribute mismatches on this element, not on its children. */}
      <body suppressHydrationWarning className="min-h-screen bg-white font-sans text-gray-900 antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
