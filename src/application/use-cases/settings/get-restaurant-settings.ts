import type { SettingsRepository } from "@/application/ports/settings-repository";
import type { RestaurantSettings } from "@/domain/restaurant/settings";
import { err, ok, type Result } from "@/domain/shared/result";
import { requireSettingsPermission, type SettingsActor, type SettingsUseCaseError } from "./shared";

export function makeGetRestaurantSettings(deps: { settings: SettingsRepository }) {
  return async (actor: SettingsActor): Promise<Result<RestaurantSettings, SettingsUseCaseError>> => {
    const allowed = requireSettingsPermission(actor);
    if (!allowed.ok) return allowed;
    const settings = await deps.settings.find(actor.restaurantId);
    return settings ? ok(settings) : err({ type: "NOT_FOUND" });
  };
}
