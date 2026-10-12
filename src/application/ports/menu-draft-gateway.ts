import type { Result } from "@/domain/shared/result";

/** A picture or a PDF of a printed menu. The type was worked out from the file's own bytes, not from its name. */
export type MenuSource = {
  readonly bytes: Uint8Array;
  readonly mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
};

export type MenuDraftError =
  /** No AI service is set up on this server (no key). */
  | { type: "NOT_CONFIGURED" }
  /** The service answered, but not with anything that looks like a menu. */
  | { type: "NOTHING_FOUND" }
  /** The service could not be reached, refused, or failed. */
  | { type: "SERVICE_FAILED" };

/**
 * Drafts a menu from a photo or PDF with an AI model. The answer is CSV text in the menu-import format (the same
 * columns as a spreadsheet), so it goes through the same checks and the same preview: a draft is never imported
 * without the owner looking at it. The model can misread; nothing it says is trusted further than a typed file.
 */
export interface MenuDraftGateway {
  /** Whether a draft can be asked for at all (a key is configured). Cheap: no call is made. */
  isAvailable(): boolean;
  draft(source: MenuSource): Promise<Result<string, MenuDraftError>>;
}
