"use server";

import { redirect } from "next/navigation";
import { signInStaff, signOutStaff } from "@/infrastructure/container";
import { signInVisitorHash } from "@/interface/web/customer/client-hash";
import { getCurrentSite } from "@/interface/web/current-site";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";

/** TOO_MANY_ATTEMPTS: the account or this visitor used up its wrong passwords (src/domain/shared/sign-in-limit.ts). */
export type SignInState = { error?: "INVALID_CREDENTIALS" | "TOO_MANY_ATTEMPTS" };

const MAX_EMAIL = 254;
const MAX_PASSWORD = 200;

/** Login form action. `locale` is bound by the page; the restaurant comes from the host. */
export async function signInAction(locale: string, _prev: SignInState, form: FormData): Promise<SignInState> {
  const email = form.get("email");
  const password = form.get("password");
  if (typeof email !== "string" || typeof password !== "string") return { error: "INVALID_CREDENTIALS" };
  if (email.length > MAX_EMAIL || password.length > MAX_PASSWORD) return { error: "INVALID_CREDENTIALS" };

  const site = await getCurrentSite();
  if (site.kind !== "restaurant") return { error: "INVALID_CREDENTIALS" };

  const result = await signInStaff({ restaurantId: site.restaurant.id, email, password, visitorHash: await signInVisitorHash() });
  if (!result.ok) return { error: result.error.type };

  redirect(`/${isLocale(locale) ? locale : DEFAULT_LOCALE}/staff`);
}

export async function signOutAction(locale: string): Promise<void> {
  await signOutStaff();
  redirect(`/${isLocale(locale) ? locale : DEFAULT_LOCALE}/staff/login`);
}
