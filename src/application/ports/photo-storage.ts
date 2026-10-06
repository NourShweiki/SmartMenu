/** Where menu photos live (Supabase Storage today). Paths come from domain/menu/photo.ts. */
export interface PhotoStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Public URL anyone can view (customers see photos on the menu). */
  publicUrl(path: string): string;
}
