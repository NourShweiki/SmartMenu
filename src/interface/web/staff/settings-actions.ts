"use server";

import { revalidatePath } from "next/cache";
import { settings } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { requireStaff } from "./require-staff";
import {
  readSettingsForm,
  settingsProblem,
  toRestaurantSettings,
  type SettingsFormState,
} from "./settings-form-model";

export async function saveSettingsAction(
  locale: string,
  _prev: SettingsFormState,
  form: FormData,
): Promise<SettingsFormState> {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l); // restaurant + role from host + session, never from the form
  const values = readSettingsForm(form);

  const parsed = toRestaurantSettings(values);
  if (!parsed.ok) return { values, errors: parsed.errors };

  const result = await settings.update({ restaurantId: staff.restaurantId, role: staff.role }, parsed.value);
  if (!result.ok) return { values, ...settingsProblem(result.error) };

  revalidatePath(`/${l}/staff/settings`);
  return { values, saved: true };
}
