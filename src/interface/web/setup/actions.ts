"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/domain/shared/uuid";
import { platform, signOutStaff } from "@/infrastructure/container";
import { getCurrentSite, restaurantOrigin } from "@/interface/web/current-site";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import type { SignInState } from "@/interface/web/staff/actions";
import { newRestaurantProblem, readNewRestaurantForm, toCreateRequest, type NewRestaurantState } from "./new-restaurant-model";
import type { OwnerPasswordState } from "./owner-password";
import { requireFounder } from "./require-founder";

const MAX_EMAIL = 254;
const MAX_PASSWORD = 200;

/** Founder login. Only on the platform's own address; anybody who is not a founder gets the wrong-password answer. */
export async function signInFounderAction(locale: string, _prev: SignInState, form: FormData): Promise<SignInState> {
  const email = form.get("email");
  const password = form.get("password");
  if (typeof email !== "string" || typeof password !== "string") return { error: "INVALID_CREDENTIALS" };
  if (email.length > MAX_EMAIL || password.length > MAX_PASSWORD) return { error: "INVALID_CREDENTIALS" };

  const site = await getCurrentSite();
  if (site.kind !== "platform") return { error: "INVALID_CREDENTIALS" };

  const result = await platform.signIn({ email, password });
  if (!result.ok) return { error: "INVALID_CREDENTIALS" };

  redirect(`/${isLocale(locale) ? locale : DEFAULT_LOCALE}/setup`);
}

export async function signOutFounderAction(locale: string): Promise<void> {
  await signOutStaff(); // ends this browser's session, whoever it belongs to
  redirect(`/${isLocale(locale) ? locale : DEFAULT_LOCALE}/setup/login`);
}

/** The "new restaurant" form. Who may do this is decided by the session (a founder), never by the form. */
export async function createRestaurantAction(locale: string, _prev: NewRestaurantState, form: FormData): Promise<NewRestaurantState> {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  await requireFounder(l);

  const { id, values } = readNewRestaurantForm(form);
  const result = await platform.createRestaurant(toCreateRequest(id, values));
  // After a refusal the form keeps its id: correcting a field and sending again is still the same attempt.
  if (!result.ok) return { values, formId: isUuid(id) ? id : crypto.randomUUID(), ...newRestaurantProblem(result.error) };

  const { restaurant, ownerEmail, temporaryPassword } = result.value;
  revalidatePath(`/${l}/setup`);
  return {
    created: {
      name: restaurant.name,
      staffUrl: `${await restaurantOrigin(restaurant.slug)}/${restaurant.settings.defaultLanguage}/staff/login`,
      ownerEmail,
      temporaryPassword,
    },
    formId: crypto.randomUUID(),
  };
}

/**
 * "New temporary password" for a restaurant's owner. The two ids are bound by the page, but they are only a request:
 * the use case checks that the signed-in person is a founder and that the account really is an owner of that
 * restaurant before anything is changed.
 */
export async function issueOwnerPasswordAction(locale: string, restaurantId: string, ownerId: string): Promise<OwnerPasswordState> {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  await requireFounder(l);

  const result = await platform.issueTemporaryPassword({ restaurantId, ownerId });
  if (!result.ok) return { error: result.error.type === "NOT_AN_OWNER" ? "notAnOwner" : "notAllowed" };
  return { issued: { temporaryPassword: result.value.temporaryPassword } };
}
