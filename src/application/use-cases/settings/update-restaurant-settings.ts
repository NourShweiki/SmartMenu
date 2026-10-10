import type { SettingsRepository } from "@/application/ports/settings-repository";
import { validateSettings, type RestaurantSettings } from "@/domain/restaurant/settings";
import { err, type Result } from "@/domain/shared/result";
import { requireSettingsPermission, type SettingsActor, type SettingsUseCaseError } from "./shared";

export function makeUpdateRestaurantSettings(deps: { settings: SettingsRepository }) {
  return async (
    actor: SettingsActor,
    input: RestaurantSettings,
  ): Promise<Result<RestaurantSettings, SettingsUseCaseError>> => {
    const allowed = requireSettingsPermission(actor);
    if (!allowed.ok) return allowed;

    const valid = validateSettings(input); // at least one order mode, rates 0..10000 bp
    if (!valid.ok) return valid;
    const saved = await deps.settings.update(actor.restaurantId, valid.value);
    // The database refused (or the row vanished): never report success we did not get.
    return saved ? valid : err({ type: "NOT_FOUND" });
  };
}
