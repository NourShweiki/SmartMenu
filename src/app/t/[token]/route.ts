import { NextResponse } from "next/server";
import { getCurrentSite } from "@/interface/web/current-site";
import { getRequestOrigin } from "@/interface/web/tables/scan-url";

/**
 * The address inside every printed table QR code: `<restaurant address>/t/<token>`. It has no language in it (a
 * printed code must never change), so it sends the visitor to the restaurant's DEFAULT language, where the scan
 * is actually handled. An address that is not a restaurant's gets a plain 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const site = await getCurrentSite();
  if (site.kind !== "restaurant") return new NextResponse("Not found", { status: 404 });
  const origin = await getRequestOrigin();
  return NextResponse.redirect(new URL(`/${site.restaurant.settings.defaultLanguage}/t/${encodeURIComponent(token)}`, origin));
}
