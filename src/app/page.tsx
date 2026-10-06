import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { slugFromHost } from "@/domain/restaurant/host";
import { appRootDomain, getPublicRestaurant } from "@/infrastructure/container";

export default async function HomePage() {
  const host = (await headers()).get("host") ?? "";
  const slug = slugFromHost(host, appRootDomain());

  if (!slug) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <h1 className="text-2xl font-semibold">SmartMenu</h1>
      </main>
    );
  }

  const result = await getPublicRestaurant({ slug });
  if (!result.ok) notFound();

  const { name, settings } = result.value;
  const primary = settings.defaultLanguage;
  const secondary = primary === "ar" ? "en" : "ar";

  // Restaurant content comes from the _ar/_en columns. Full /ar + /en routing comes later;
  // until then the default language leads and the other name sits below it.
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 lang={primary} className="text-3xl font-semibold leading-relaxed">
        {name[primary]}
      </h1>
      <p className="text-lg text-gray-500">
        <bdi lang={secondary}>{name[secondary]}</bdi>
      </p>
    </main>
  );
}
