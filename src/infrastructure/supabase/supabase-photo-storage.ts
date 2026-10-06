import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhotoStorage } from "@/application/ports/photo-storage";

export const MENU_IMAGES_BUCKET = "menu-images";

/**
 * Supabase Storage. Use the signed-in staff user's client for upload/remove: the bucket's
 * RLS only lets that restaurant's OWNER/MANAGER write into "<restaurantId>/...".
 */
export class SupabasePhotoStorage implements PhotoStorage {
  constructor(private readonly db: SupabaseClient) {}

  async upload(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.db.storage.from(MENU_IMAGES_BUCKET).upload(path, bytes, {
      contentType,
      upsert: false,
      // Every upload gets a new file name, so browsers may cache a photo "forever".
      cacheControl: "31536000",
    });
    if (error) throw new Error(`photo upload failed: ${error.message}`);
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.db.storage.from(MENU_IMAGES_BUCKET).remove([path]);
    if (error) throw new Error(`photo remove failed: ${error.message}`);
  }

  publicUrl(path: string): string {
    return this.db.storage.from(MENU_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
  }
}
