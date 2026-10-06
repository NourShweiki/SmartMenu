import { describe, expect, it } from "vitest";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { createCategory, createMenuItem, deleteMenuItem, setItemPhoto, type MenuItemId } from "./menu";
import { detectPhotoType, MAX_PHOTO_BYTES, photoPath, validatePhoto } from "./photo";

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const WEBP = bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"));

describe("photo type detection", () => {
  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect(detectPhotoType(JPEG)?.extension).toBe("jpg");
    expect(detectPhotoType(PNG)?.extension).toBe("png");
    expect(detectPhotoType(WEBP)?.extension).toBe("webp");
  });

  it("rejects other files even if they claim to be images", () => {
    expect(detectPhotoType(bytes(...ascii("<svg xmlns=")))).toBeNull(); // SVG can carry scripts
    expect(detectPhotoType(bytes(...ascii("<!DOCTYPE html>")))).toBeNull();
    expect(detectPhotoType(bytes(...ascii("GIF89a"), 0, 0, 0, 0, 0, 0))).toBeNull();
    expect(detectPhotoType(bytes())).toBeNull();
  });
});

describe("validatePhoto", () => {
  it("accepts a JPEG up to 5 MB", () => {
    expect(validatePhoto({ head: JPEG, sizeBytes: MAX_PHOTO_BYTES }).ok).toBe(true);
  });

  it("rejects empty, too large, or wrong-type files", () => {
    expect(validatePhoto({ head: JPEG, sizeBytes: 0 })).toEqual({ ok: false, error: { type: "PHOTO_EMPTY" } });
    expect(validatePhoto({ head: JPEG, sizeBytes: MAX_PHOTO_BYTES + 1 })).toEqual({ ok: false, error: { type: "PHOTO_TOO_LARGE" } });
    expect(validatePhoto({ head: bytes(...ascii("%PDF-1.7")), sizeBytes: 100 })).toEqual({
      ok: false,
      error: { type: "PHOTO_TYPE_NOT_ALLOWED" },
    });
  });
});

describe("item photo", () => {
  const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
  const deps = { newId: () => crypto.randomUUID() };
  const cat = createCategory(R, { name: { en: "G", ar: "م" }, sortOrder: 0 }, deps);
  if (!cat.ok) throw new Error();
  const made = createMenuItem(cat.value, { name: { en: "K", ar: "ك" }, description: { en: "", ar: "" }, priceFils: 1, sortOrder: 0 }, deps);
  if (!made.ok) throw new Error();
  const item = made.value;

  it("builds the path inside the restaurant's folder and sets / clears it", () => {
    const path = photoPath(R, item.id, "f1", { contentType: "image/png", extension: "png" });
    expect(path).toBe(`${R}/${item.id}/f1.png`);
    const withPhoto = setItemPhoto(item, path);
    expect(withPhoto.ok && withPhoto.value.imagePath).toBe(path);
    expect(withPhoto.ok && setItemPhoto(withPhoto.value, null)).toMatchObject({ ok: true, value: { imagePath: null } });
  });

  it("refuses a path outside the item's folder (programming error)", () => {
    expect(() => setItemPhoto(item, `${R}/${"other" as MenuItemId}/x.png`)).toThrow();
  });

  it("cannot change a deleted item's photo", () => {
    const deleted = deleteMenuItem(item, new Date());
    if (!deleted.ok) throw new Error();
    expect(setItemPhoto(deleted.value, null)).toEqual({ ok: false, error: { type: "DELETED" } });
  });
});
