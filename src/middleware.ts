import type { NextRequest } from "next/server";
import { refreshSessionCookies } from "@/infrastructure/container";

// Keeps staff sessions fresh. Customer pages never sign in, so only staff routes pay for it.
export function middleware(request: NextRequest) {
  return refreshSessionCookies(request);
}

export const config = { matcher: ["/(ar|en)/staff/:path*"] };
