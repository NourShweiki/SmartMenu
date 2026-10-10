import type { PhotoError } from "@/domain/menu/photo";
import type { BrandingError } from "@/domain/restaurant/branding";
import { requirePermission, type ForbiddenError, type StaffActor } from "../permissions";

/** The signed-in staff member acting on the restaurant branding. */
export type BrandingActor = StaffActor;

export type BrandingUseCaseError = BrandingError | PhotoError | ForbiddenError | { type: "NOT_FOUND" };

/** Branding is part of `restaurant:settings` (role.ts: modes, tax, branding, domain): the OWNER only. */
export const requireBrandingPermission = (actor: BrandingActor) => requirePermission(actor, "restaurant:settings");
