import type { SettingsError } from "@/domain/restaurant/settings";
import { requirePermission, type ForbiddenError, type StaffActor } from "../permissions";

/** The signed-in staff member acting on the restaurant settings. */
export type SettingsActor = StaffActor;

export type SettingsUseCaseError = SettingsError | ForbiddenError | { type: "NOT_FOUND" };

/** Only roles with `restaurant:settings` (the OWNER) may see or change settings. */
export const requireSettingsPermission = (actor: SettingsActor) => requirePermission(actor, "restaurant:settings");
