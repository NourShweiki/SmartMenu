"use server";

import { revalidatePath } from "next/cache";
import type { MenuUseCaseError } from "@/application/use-cases/menu/shared";
import type { MenuItemId } from "@/domain/menu/menu";
import { MAX_PHOTO_BYTES } from "@/domain/menu/photo";
import { menu } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { requireStaff } from "./require-staff";

export type PhotoFormState = {
  error?: "empty" | "tooLarge" | "notImage" | "forbidden" | "notFound";
  /** Bumps on every success so the form can reset its file input. */
  savedAt?: number;
};

function toState(error: MenuUseCaseError): PhotoFormState {
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

async function context(locale: string) {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l); // restaurant + role from host + session
  return { locale: l, actor: { restaurantId: staff.restaurantId, role: staff.role } };
}

export async function uploadPhotoAction(
  locale: string,
  itemId: string,
  _prev: PhotoFormState,
  form: FormData,
): Promise<PhotoFormState> {
  const ctx = await context(locale);
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "empty" };
  if (file.size > MAX_PHOTO_BYTES) return { error: "tooLarge" }; // don't even read it

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await menu.setItemPhoto(ctx.actor, { itemId: itemId as MenuItemId, bytes });
  if (!result.ok) return toState(result.error);

  revalidatePath(`/${ctx.locale}/staff/menu`, "layout");
  return { savedAt: Date.now() };
}

export async function removePhotoAction(locale: string, itemId: string): Promise<PhotoFormState> {
  const ctx = await context(locale);
  const result = await menu.removeItemPhoto(ctx.actor, { itemId: itemId as MenuItemId });
  if (!result.ok) return toState(result.error);
  revalidatePath(`/${ctx.locale}/staff/menu`, "layout");
  return { savedAt: Date.now() };
}
