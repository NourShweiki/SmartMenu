"use server";

import { revalidatePath } from "next/cache";
import type { BrandingUseCaseError } from "@/application/use-cases/branding/shared";
import { MAX_LOGO_BYTES } from "@/domain/restaurant/branding";
import { branding } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import {
  brandingProblem,
  readBrandingForm,
  toBrandingInput,
  type BrandingFormState,
} from "./branding-form-model";
import type { PhotoFormState } from "./photo-actions";
import { requireStaff } from "./require-staff";

async function context(locale: string) {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l); // restaurant + role from host + session, never from the form
  return { locale: l, actor: { restaurantId: staff.restaurantId, role: staff.role } };
}

/** What every page of the restaurant shows (name, logo, colour) must refresh after a change. */
function refresh(locale: string) {
  revalidatePath(`/${locale}`, "layout");
}

export async function saveBrandingAction(
  locale: string,
  _prev: BrandingFormState,
  form: FormData,
): Promise<BrandingFormState> {
  const ctx = await context(locale);
  const values = readBrandingForm(form);

  const result = await branding.update(ctx.actor, toBrandingInput(values));
  if (!result.ok) return { values, ...brandingProblem(result.error) };

  refresh(ctx.locale);
  return { values, saved: true };
}

function logoState(error: BrandingUseCaseError): PhotoFormState {
  switch (error.type) {
    case "PHOTO_EMPTY":
      return { error: "empty" };
    case "PHOTO_TOO_LARGE":
      return { error: "tooLarge" };
    case "PHOTO_TYPE_NOT_ALLOWED":
      return { error: "notImage" };
    case "FORBIDDEN":
      return { error: "forbidden" };
    default:
      return { error: "notFound" };
  }
}

export async function uploadLogoAction(locale: string, _prev: PhotoFormState, form: FormData): Promise<PhotoFormState> {
  const ctx = await context(locale);
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "empty" };
  if (file.size > MAX_LOGO_BYTES) return { error: "tooLarge" }; // don't even read it

  const result = await branding.setLogo(ctx.actor, { bytes: new Uint8Array(await file.arrayBuffer()) });
  if (!result.ok) return logoState(result.error);
  refresh(ctx.locale);
  return { savedAt: Date.now() };
}

export async function removeLogoAction(locale: string): Promise<PhotoFormState> {
  const ctx = await context(locale);
  const result = await branding.removeLogo(ctx.actor);
  if (!result.ok) return logoState(result.error);
  refresh(ctx.locale);
  return { savedAt: Date.now() };
}
