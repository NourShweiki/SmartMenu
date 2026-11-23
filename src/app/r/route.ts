import { NextResponse } from "next/server";
import { previewLinksEnabled } from "@/infrastructure/container";
import { SESSION_COOKIE } from "@/interface/web/customer/session-cookie";
import { PREVIEW_COOKIE } from "@/interface/web/current-site";
import { getRequestOrigin } from "@/interface/web/tables/scan-url";

/** Leave the preview: forget the previewed restaurant (and its table visit) and go back to the platform's home. */
export async function GET() {
  if (!previewLinksEnabled()) return new NextResponse("Not found", { status: 404 });
  const response = NextResponse.redirect(new URL("/", await getRequestOrigin()));
  response.cookies.delete(PREVIEW_COOKIE);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
