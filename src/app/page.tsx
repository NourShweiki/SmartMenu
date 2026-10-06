import { redirect } from "next/navigation";
import { getCurrentSite } from "@/interface/web/current-site";
import { DEFAULT_LOCALE } from "@/interface/web/i18n/locales";

// "/" has no language yet: send customers to their restaurant's default language.
export default async function RootPage() {
  const site = await getCurrentSite();
  redirect(`/${site.kind === "restaurant" ? site.restaurant.settings.defaultLanguage : DEFAULT_LOCALE}`);
}
