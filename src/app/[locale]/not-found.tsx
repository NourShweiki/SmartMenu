import { getTranslations } from "next-intl/server";

// Translated 404 for anything under /ar or /en (unknown restaurant, unknown page).
export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-gray-500">{t("description")}</p>
    </main>
  );
}
