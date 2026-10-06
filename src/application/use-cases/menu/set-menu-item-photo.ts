import { setItemPhoto, type MenuItem, type MenuItemId } from "@/domain/menu/menu";
import { photoPath, validatePhoto } from "@/domain/menu/photo";
import { err, type Result } from "@/domain/shared/result";
import type { MenuRepository } from "@/application/ports/menu-repository";
import type { PhotoStorage } from "@/application/ports/photo-storage";
import type { IdGenerator } from "@/application/ports/system";
import { requirePermission, type MenuActor, type MenuUseCaseError } from "./shared";

type Deps = { menu: MenuRepository; photos: PhotoStorage; ids: IdGenerator };

/** Upload a new photo for an item (replacing any old one). Owner/manager only. */
export function makeSetMenuItemPhoto(deps: Deps) {
  return async (
    actor: MenuActor,
    input: { itemId: MenuItemId; bytes: Uint8Array },
  ): Promise<Result<MenuItem, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    const type = validatePhoto({ head: input.bytes.subarray(0, 16), sizeBytes: input.bytes.byteLength });
    if (!type.ok) return type;

    const item = await deps.menu.findItem(actor.restaurantId, input.itemId);
    if (!item) return err({ type: "ITEM_NOT_FOUND" });

    const path = photoPath(actor.restaurantId, item.id, deps.ids.newId(), type.value);
    const updated = setItemPhoto(item, path);
    if (!updated.ok) return updated;

    // New file first, then point the item at it, then drop the old file.
    await deps.photos.upload(path, input.bytes, type.value.contentType);
    try {
      await deps.menu.updateItem(updated.value);
    } catch (e) {
      await deps.photos.remove(path).catch(() => undefined); // don't leave an orphan behind
      throw e;
    }
    if (item.imagePath) await deps.photos.remove(item.imagePath).catch(() => undefined);
    return updated;
  };
}

/** Remove an item's photo. Owner/manager only. */
export function makeRemoveMenuItemPhoto(deps: Omit<Deps, "ids">) {
  return async (actor: MenuActor, input: { itemId: MenuItemId }): Promise<Result<MenuItem, MenuUseCaseError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;

    const item = await deps.menu.findItem(actor.restaurantId, input.itemId);
    if (!item) return err({ type: "ITEM_NOT_FOUND" });
    const updated = setItemPhoto(item, null);
    if (!updated.ok) return updated;

    await deps.menu.updateItem(updated.value);
    if (item.imagePath) await deps.photos.remove(item.imagePath).catch(() => undefined);
    return updated;
  };
}
