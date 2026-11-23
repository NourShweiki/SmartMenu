import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localized } from "@/domain/shared/localized";
import { previewLinksEnabled } from "@/infrastructure/container";
import { getCurrentSite } from "@/interface/web/current-site";
import type { Locale } from "@/interface/web/i18n/locales";

/**
 * A strip at the top of every page shown through a preview link (`/r/<slug>`), so nobody mistakes the deployment's
 * shared address for the restaurant's own site, with a way out. Not printed (QR sheets stay clean).
 */
export async function PreviewBanner({ locale }: { locale: Locale }) {
  if (!previewLinksEnabled()) return null;
  const site = await getCurrentSite();
  if (site.kind !== "restaurant" || !site.viaPreview) return null;
  const t = await getTranslations("Preview");
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900 print:hidden">
      <span>{t("banner", { name: localized(site.restaurant.name, locale) })}</span>
      {/* prefetch off: /r clears the preview cookie, so it must only run when clicked. */}
      <Link href="/r" prefetch={false} className="font-semibold underline">
        {t("exit")}
      </Link>
    </div>
  );
}
