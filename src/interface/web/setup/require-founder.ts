import { notFound, redirect } from "next/navigation";
import type { Founder } from "@/application/use-cases/platform/founder-access";
import { platform } from "@/infrastructure/container";
import { getCurrentSite } from "@/interface/web/current-site";
import type { Locale } from "@/interface/web/i18n/locales";

/**
 * Guard for every setup page and setup Server Action. The setup tool lives on the platform's own address only: on
 * a restaurant's address it does not exist (404). Not signed in, or signed in but not a founder -> the setup login.
 */
export async function requireFounder(locale: Locale): Promise<Founder> {
  const site = await getCurrentSite();
  if (site.kind !== "platform") notFound();
  const founder = await platform.founder();
  if (!founder.ok) redirect(`/${locale}/setup/login`);
  return founder.value;
}
