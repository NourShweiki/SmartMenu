import { NextResponse } from "next/server";
import { previewLinksEnabled } from "@/infrastructure/container";
import { SESSION_COOKIE } from "@/interface/web/customer/session-cookie";
import { isPlatformAddress, PREVIEW_COOKIE } from "@/interface/web/current-site";
import { getRequestOrigin } from "@/interface/web/tables/scan-url";

/**
 * Leave the preview: forget the previewed restaurant (and its table visit) and go back to the platform's home.
 * Only on the platform's address: on a restaurant's real subdomain it would just end a guest's table visit.
 */
export async function GET() {
  if (!previewLinksEnabled() || !(await isPlatformAddress())) return new NextResponse("Not found", { status: 404 });
  const response = NextResponse.redirect(new URL("/", await getRequestOrigin()));
  response.cookies.delete(PREVIEW_COOKIE);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
