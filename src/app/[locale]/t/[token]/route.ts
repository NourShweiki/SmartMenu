import { NextResponse } from "next/server";
import { tableSessions } from "@/infrastructure/container";
import { getCurrentSite } from "@/interface/web/current-site";
import { isLocale } from "@/interface/web/i18n/locales";
import { SESSION_COOKIE, sessionCookieOptions } from "@/interface/web/customer/session-cookie";
import { getRequestOrigin } from "@/interface/web/tables/scan-url";

/**
 * A guest scanned a table's QR code (`/t/<token>` redirects here in the restaurant's default language).
 * The SERVER does everything: it joins the table's live session (the database checks the restaurant, the random token,
 * that the table is active and that dine-in is on), remembers the session in a cookie, and sends the guest to the menu.
 * No page scripts are involved, so it works on any phone. A code that is not valid goes to a friendly "not active" page.
 * Public: no login.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  const site = await getCurrentSite();
  if (site.kind !== "restaurant" || !isLocale(locale)) return new NextResponse("Not found", { status: 404 });

  const origin = await getRequestOrigin();
  const session = await tableSessions.join({ slug: site.restaurant.slug, token });
  if (!session) return NextResponse.redirect(new URL(`/${locale}/scan-invalid`, origin));

  const response = NextResponse.redirect(new URL(`/${locale}/menu`, origin));
  response.cookies.set(SESSION_COOKIE, session.sessionId, sessionCookieOptions(origin.startsWith("https://")));
  return response;
}
