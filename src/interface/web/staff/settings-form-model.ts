import type { SettingsUseCaseError } from "@/application/use-cases/settings/shared";
import type { RestaurantSettings } from "@/domain/restaurant/settings";
import { parseRateInput } from "@/interface/web/rate-input";

// Pure form logic for the settings screen, kept out of the "use server" file so it can be unit tested
// (a "use server" module may only export async functions).

export type SettingsFormValues = {
  dineInEnabled: boolean;
  takeoutEnabled: boolean;
  deliveryEnabled: boolean;
  taxPercent: string;
  servicePercent: string;
  defaultLanguage: "ar" | "en";
};

export type SettingsFormState = {
  values?: SettingsFormValues;
  errors?: Partial<Record<"taxPercent" | "servicePercent", "invalid">>;
  formError?: "forbidden" | "notFound" | "noMode";
  /** True right after a successful save, so the form can say so. */
  saved?: boolean;
};

type FormLike = { has(name: string): boolean; get(name: string): FormDataEntryValue | null };

/** What the owner submitted. A checkbox is in the form data only when it is ticked. */
export function readSettingsForm(form: FormLike): SettingsFormValues {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.slice(0, 20) : "";
  };
  return {
    dineInEnabled: form.has("dineInEnabled"),
    takeoutEnabled: form.has("takeoutEnabled"),
    deliveryEnabled: form.has("deliveryEnabled"),
    taxPercent: text("taxPercent"),
    servicePercent: text("servicePercent"),
    defaultLanguage: text("defaultLanguage") === "en" ? "en" : "ar",
  };
}

/** Percentages -> basis points. Anything that is not a plain percentage becomes a field error. */
export function toRestaurantSettings(
  values: SettingsFormValues,
): { ok: true; value: RestaurantSettings } | { ok: false; errors: NonNullable<SettingsFormState["errors"]> } {
  const taxRateBp = parseRateInput(values.taxPercent);
  const serviceChargeBp = parseRateInput(values.servicePercent);
  if (taxRateBp === null || serviceChargeBp === null) {
    return {
      ok: false,
      errors: {
        ...(taxRateBp === null && { taxPercent: "invalid" as const }),
        ...(serviceChargeBp === null && { servicePercent: "invalid" as const }),
      },
    };
  }
  return {
    ok: true,
    value: {
      dineInEnabled: values.dineInEnabled,
      takeoutEnabled: values.takeoutEnabled,
      deliveryEnabled: values.deliveryEnabled,
      taxRateBp,
      serviceChargeBp,
      defaultLanguage: values.defaultLanguage,
    },
  };
}

/** Use-case failure -> what the form shows (translated by the form). */
export function settingsProblem(error: SettingsUseCaseError): Pick<SettingsFormState, "errors" | "formError"> {
  switch (error.type) {
    case "FORBIDDEN":
      return { formError: "forbidden" };
    case "NO_ORDER_MODE_ENABLED":
      return { formError: "noMode" };
    case "INVALID_RATE":
      return { errors: { [error.field === "taxRateBp" ? "taxPercent" : "servicePercent"]: "invalid" } };
    case "NOT_FOUND":
      return { formError: "notFound" };
  }
}
