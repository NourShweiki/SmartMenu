import type { BrandingRecord, BrandingRepository } from "@/application/ports/branding-repository";
import { err, ok, type Result } from "@/domain/shared/result";
import { requireBrandingPermission, type BrandingActor, type BrandingUseCaseError } from "./shared";

export function makeGetBranding(deps: { branding: BrandingRepository }) {
  return async (actor: BrandingActor): Promise<Result<BrandingRecord, BrandingUseCaseError>> => {
    const allowed = requireBrandingPermission(actor);
    if (!allowed.ok) return allowed;
    const record = await deps.branding.find(actor.restaurantId);
    return record ? ok(record) : err({ type: "NOT_FOUND" });
  };
}
