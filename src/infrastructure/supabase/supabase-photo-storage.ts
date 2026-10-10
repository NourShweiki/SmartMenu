import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhotoStorage } from "@/application/ports/photo-storage";

export const MENU_IMAGES_BUCKET = "menu-images";
export const LOGOS_BUCKET = "restaurant-logos";

/**
 * Supabase Storage for one public image bucket (menu photos by default, or the restaurant logos). Use the
 * signed-in staff user's client for upload/remove: the bucket's RLS only lets that restaurant's staff
 * (OWNER/MANAGER for menu photos, OWNER for logos) write into "<restaurantId>/...".
 */
export class SupabasePhotoStorage implements PhotoStorage {
  constructor(
    private readonly db: SupabaseClient,
    private readonly bucket: string = MENU_IMAGES_BUCKET,
  ) {}

  async upload(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.db.storage.from(this.bucket).upload(path, bytes, {
      contentType,
      upsert: false,
      // Every upload gets a new file name, so browsers may cache a photo "forever".
      cacheControl: "31536000",
    });
    if (error) throw new Error(`photo upload failed: ${error.message}`);
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.db.storage.from(this.bucket).remove([path]);
    if (error) throw new Error(`photo remove failed: ${error.message}`);
  }

  publicUrl(path: string): string {
    return this.db.storage.from(this.bucket).getPublicUrl(path).data.publicUrl;
  }
}
