import type { NextRequest } from "next/server";
import { refreshSessionCookies } from "@/infrastructure/container";

// Keeps staff and founder sessions fresh. Customer pages never sign in, so only those routes pay for it.
export function middleware(request: NextRequest) {
  return refreshSessionCookies(request);
}

export const config = { matcher: ["/(ar|en)/staff/:path*", "/(ar|en)/setup/:path*"] };
