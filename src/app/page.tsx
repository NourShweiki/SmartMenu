import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { slugFromHost } from "@/domain/restaurant/host";
import { appRootDomain, getPublicRestaurant } from "@/infrastructure/container";
import { DEFAULT_LOCALE } from "@/interface/web/i18n/locales";

// "/" has no language yet: send customers to their restaurant's default language.
export default async function RootPage() {
  const slug = slugFromHost((await headers()).get("host") ?? "", appRootDomain());
  const restaurant = slug ? await getPublicRestaurant({ slug }) : null;
  redirect(`/${restaurant?.ok ? restaurant.value.settings.defaultLanguage : DEFAULT_LOCALE}`);
}
