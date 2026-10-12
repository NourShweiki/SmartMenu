import type { MenuDraftError, MenuDraftGateway, MenuSource } from "@/application/ports/menu-draft-gateway";
import { detectPhotoType } from "@/domain/menu/photo";
import { err, type Result } from "@/domain/shared/result";
import { requirePermission, type MenuActor } from "./shared";
import type { ForbiddenError } from "../permissions";

/**
 * A phone photo of a menu page is a few MB. The same limit as an item photo, on purpose: uploads travel through a
 * Server Action, whose body limit is set for that size (next.config.ts). Bigger files are refused unread.
 */
export const MAX_MENU_SOURCE_BYTES = 5 * 1024 * 1024;

export type DraftMenuError = ForbiddenError | MenuDraftError | { type: "FILE_EMPTY" } | { type: "FILE_TOO_LARGE" } | { type: "FILE_TYPE_NOT_ALLOWED" };

/** The kind of file, from its first bytes (a name or a claimed type can be anything). */
function sourceType(bytes: Uint8Array): MenuSource["mediaType"] | null {
  const photo = detectPhotoType(bytes.slice(0, 16));
  if (photo) return photo.contentType;
  const head = String.fromCharCode(...bytes.slice(0, 5));
  return head === "%PDF-" ? "application/pdf" : null;
}

/**
 * The owner or manager uploads a photo or PDF of their printed menu and gets a DRAFT back, as CSV text in the
 * menu-import format. Nothing is added to the menu here: the draft goes into the import preview, where every row is
 * checked and the owner decides.
 */
export function makeDraftMenuFromFile(deps: { drafts: MenuDraftGateway }) {
  return async (actor: MenuActor, file: { bytes: Uint8Array }): Promise<Result<string, DraftMenuError>> => {
    const allowed = requirePermission(actor, "menu:manage");
    if (!allowed.ok) return allowed;
    if (!deps.drafts.isAvailable()) return err({ type: "NOT_CONFIGURED" });

    if (file.bytes.length === 0) return err({ type: "FILE_EMPTY" });
    if (file.bytes.length > MAX_MENU_SOURCE_BYTES) return err({ type: "FILE_TOO_LARGE" });
    const mediaType = sourceType(file.bytes);
    if (!mediaType) return err({ type: "FILE_TYPE_NOT_ALLOWED" });

    return deps.drafts.draft({ bytes: file.bytes, mediaType });
  };
}
