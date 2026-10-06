import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { otherLocale, type Locale } from "@/interface/web/i18n/locales";

/** Link to the same page in the other language. `path` is the part after /<locale>. */
export async function LanguageSwitch({ locale, path = "" }: { locale: Locale; path?: string }) {
  const t = await getTranslations("LanguageSwitch");
  const target = otherLocale(locale);
  return (
    <Link
      href={`/${target}${path}`}
      lang={target}
      hrefLang={target}
      className="rounded-full border border-gray-300 px-4 py-1 text-sm hover:bg-gray-100"
    >
      {t("label")}
    </Link>
  );
}
