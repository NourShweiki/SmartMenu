import type { BrandingRecord, BrandingRepository } from "@/application/ports/branding-repository";
import type { PhotoStorage } from "@/application/ports/photo-storage";
import type { IdGenerator } from "@/application/ports/system";
import { logoPath, setLogo, validateLogo } from "@/domain/restaurant/branding";
import { err, ok, type Result } from "@/domain/shared/result";
import { requireBrandingPermission, type BrandingActor, type BrandingUseCaseError } from "./shared";

type Deps = { branding: BrandingRepository; logos: PhotoStorage; ids: IdGenerator };

/** Upload a new logo (replacing any old one). OWNER only. */
export function makeSetRestaurantLogo(deps: Deps) {
  return async (actor: BrandingActor, input: { bytes: Uint8Array }): Promise<Result<BrandingRecord, BrandingUseCaseError>> => {
    const allowed = requireBrandingPermission(actor);
    if (!allowed.ok) return allowed;

    const type = validateLogo({ head: input.bytes.subarray(0, 16), sizeBytes: input.bytes.byteLength });
    if (!type.ok) return type;

    const current = await deps.branding.find(actor.restaurantId);
    if (!current) return err({ type: "NOT_FOUND" });

    const path = logoPath(actor.restaurantId, deps.ids.newId(), type.value);
    const next: BrandingRecord = { name: current.name, branding: setLogo(current.branding, path) };

    // New file first, then point the branding at it, then drop the old file.
    await deps.logos.upload(path, input.bytes, type.value.contentType);
    let saved = false;
    try {
      saved = await deps.branding.save(actor.restaurantId, next);
    } finally {
      if (!saved) await deps.logos.remove(path).catch(() => undefined); // no orphan file if the save failed
    }
    if (!saved) return err({ type: "NOT_FOUND" });
    if (current.branding.logoPath) await deps.logos.remove(current.branding.logoPath).catch(() => undefined);
    return ok(next);
  };
}

/** Remove the logo. OWNER only. */
export function makeRemoveRestaurantLogo(deps: Omit<Deps, "ids">) {
  return async (actor: BrandingActor): Promise<Result<BrandingRecord, BrandingUseCaseError>> => {
    const allowed = requireBrandingPermission(actor);
    if (!allowed.ok) return allowed;

    const current = await deps.branding.find(actor.restaurantId);
    if (!current) return err({ type: "NOT_FOUND" });
    const next: BrandingRecord = { name: current.name, branding: setLogo(current.branding, null) };

    const saved = await deps.branding.save(actor.restaurantId, next);
    if (!saved) return err({ type: "NOT_FOUND" });
    if (current.branding.logoPath) await deps.logos.remove(current.branding.logoPath).catch(() => undefined);
    return ok(next);
  };
}
