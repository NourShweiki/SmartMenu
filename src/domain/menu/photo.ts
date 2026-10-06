import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err, ok, type Result } from "@/domain/shared/result";
import type { MenuItemId } from "./menu";

/** One photo per item, JPG / PNG / WebP, up to 5 MB (decided 2026-10-06). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type PhotoType = { contentType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" };

export type PhotoError = { type: "PHOTO_EMPTY" } | { type: "PHOTO_TOO_LARGE" } | { type: "PHOTO_TYPE_NOT_ALLOWED" };

/**
 * Decides the type from the file's first bytes ("magic numbers"), NOT from the name or the
 * browser's claimed content type, which anyone can fake (e.g. an HTML/SVG file named .jpg).
 */
export function detectPhotoType(head: Uint8Array): PhotoType | null {
  const at = (i: number) => head[i];
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return { contentType: "image/jpeg", extension: "jpg" };
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)) {
    return { contentType: "image/png", extension: "png" };
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (head.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}

export function validatePhoto(file: { head: Uint8Array; sizeBytes: number }): Result<PhotoType, PhotoError> {
  if (file.sizeBytes <= 0) return err({ type: "PHOTO_EMPTY" });
  if (file.sizeBytes > MAX_PHOTO_BYTES) return err({ type: "PHOTO_TOO_LARGE" });
  const type = detectPhotoType(file.head);
  return type ? ok(type) : err({ type: "PHOTO_TYPE_NOT_ALLOWED" });
}

/**
 * Storage path: "<restaurantId>/<itemId>/<fileId>.<ext>". The first folder MUST be the
 * restaurant id — the storage security rules use it to decide who may write there.
 * A fresh fileId per upload means a replaced photo never shows a stale cached image.
 */
export function photoPath(restaurantId: RestaurantId, itemId: MenuItemId, fileId: string, type: PhotoType): string {
  return `${restaurantId}/${itemId}/${fileId}.${type.extension}`;
}
