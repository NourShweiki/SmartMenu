import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "./locales";

// next-intl loads this for every request via the `next-intl/config` alias in next.config.ts.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../../../messages/${locale}.json`)).default,
    timeZone: "Asia/Amman",
  };
});
