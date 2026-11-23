import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validateSlug } from "@/domain/restaurant/restaurant";
import { getPublicRestaurant, previewLinksEnabled } from "@/infrastructure/container";
import { SESSION_COOKIE } from "@/interface/web/customer/session-cookie";
import { isPlatformAddress, PREVIEW_COOKIE } from "@/interface/web/current-site";
import { previewCookieOptions, previewTarget } from "@/interface/web/preview-link-model";
import { getRequestOrigin } from "@/interface/web/tables/scan-url";

/**
 * A preview link: `/r/<slug>/<path>` shows restaurant <slug> on this deployment's bare address (PROJECT_SPEC.md §5).
 * Only when RESTAURANT_PREVIEW_LINKS=1 and only on the platform's own address (a real subdomain never needs it).
 * It remembers the restaurant in the preview cookie and sends the visitor to the normal page (`previewTarget`).
 * Switching to another restaurant also forgets the table visit, so one restaurant's visit never reaches another's
 * pages (on real subdomains each restaurant's address keeps its own cookie; here they share one address).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; rest?: string[] }> }) {
  const notFound = () => new NextResponse("Not found", { status: 404 });
  if (!previewLinksEnabled() || !(await isPlatformAddress())) return notFound();

  const { slug: raw, rest } = await params;
  const slug = raw.trim().toLowerCase();
  if (!validateSlug(slug).ok) return notFound();
  const restaurant = await getPublicRestaurant({ slug });
  if (!restaurant.ok) return notFound();
  const path = previewTarget(rest, restaurant.value.settings.defaultLanguage);
  if (!path) return notFound();

  const origin = await getRequestOrigin();
  const response = NextResponse.redirect(new URL(path, origin));
  if ((await cookies()).get(PREVIEW_COOKIE)?.value !== slug) response.cookies.delete(SESSION_COOKIE);
  response.cookies.set(PREVIEW_COOKIE, slug, previewCookieOptions(origin.startsWith("https://")));
  return response;
}
