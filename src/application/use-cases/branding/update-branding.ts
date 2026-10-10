import type { BrandingRecord, BrandingRepository } from "@/application/ports/branding-repository";
import { updateBranding, type BrandingInput } from "@/domain/restaurant/branding";
import { err, type Result } from "@/domain/shared/result";
import { requireBrandingPermission, type BrandingActor, type BrandingUseCaseError } from "./shared";

/** Saves the restaurant name, accent colour and written details. The logo is untouched (it has its own use cases). */
export function makeUpdateBranding(deps: { branding: BrandingRepository }) {
  return async (actor: BrandingActor, input: BrandingInput): Promise<Result<BrandingRecord, BrandingUseCaseError>> => {
    const allowed = requireBrandingPermission(actor);
    if (!allowed.ok) return allowed;

    const current = await deps.branding.find(actor.restaurantId);
    if (!current) return err({ type: "NOT_FOUND" });

    const next = updateBranding(current.branding, input);
    if (!next.ok) return next;
    const saved = await deps.branding.save(actor.restaurantId, next.value);
    // The database refused (or the row vanished): never report a save that did not happen.
    return saved ? { ok: true, value: next.value } : err({ type: "NOT_FOUND" });
  };
}
