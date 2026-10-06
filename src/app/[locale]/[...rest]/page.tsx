import { notFound } from "next/navigation";
import { initLocale } from "@/interface/web/i18n/init-locale";

// Unknown paths like /ar/xyz render the translated [locale]/not-found page.
export default async function CatchAll({ params }: { params: Promise<{ locale: string }> }) {
  await initLocale(params);
  notFound();
}
