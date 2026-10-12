import { describe, expect, it } from "vitest";
import type { MenuDraftGateway, MenuSource } from "@/application/ports/menu-draft-gateway";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import { ok } from "@/domain/shared/result";
import { makeDraftMenuFromFile, MAX_MENU_SOURCE_BYTES } from "./draft-menu-from-file";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const actor = (role: Role) => ({ restaurantId: R, role });
const CSV = "category_en,category_ar,name_en,name_ar,description_en,description_ar,price\nStarters,المقبلات,Hummus,حمص,,,1.250";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = new TextEncoder().encode("%PDF-1.7 rest of the file");

function world(available = true) {
  const asked: MenuSource["mediaType"][] = [];
  const drafts: MenuDraftGateway = {
    isAvailable: () => available,
    draft: async (source) => {
      asked.push(source.mediaType);
      return ok(CSV);
    },
  };
  return { draft: makeDraftMenuFromFile({ drafts }), asked };
}

describe("draftMenuFromFile", () => {
  it("hands a photo or a PDF to the AI service, by what the file really is, and returns the draft", async () => {
    const { draft, asked } = world();
    expect(await draft(actor("OWNER"), { bytes: JPEG })).toEqual({ ok: true, value: CSV });
    await draft(actor("MANAGER"), { bytes: PNG });
    await draft(actor("OWNER"), { bytes: PDF });
    expect(asked).toEqual(["image/jpeg", "image/png", "application/pdf"]);
  });

  it("refuses an empty file, one that is too large, and anything that is not a photo or a PDF, without asking the service", async () => {
    const { draft, asked } = world();
    expect(await draft(actor("OWNER"), { bytes: new Uint8Array() })).toEqual({ ok: false, error: { type: "FILE_EMPTY" } });
    const huge = new Uint8Array(MAX_MENU_SOURCE_BYTES + 1);
    huge.set(JPEG);
    expect(await draft(actor("OWNER"), { bytes: huge })).toEqual({ ok: false, error: { type: "FILE_TOO_LARGE" } });
    expect(await draft(actor("OWNER"), { bytes: new TextEncoder().encode("<html>not a menu</html>") })).toEqual({ ok: false, error: { type: "FILE_TYPE_NOT_ALLOWED" } });
    expect(asked).toEqual([]);
  });

  it("is for whoever may change the menu, and only where the service is set up", async () => {
    const { draft, asked } = world();
    for (const role of ["WAITER", "CASHIER"] as const) expect(await draft(actor(role), { bytes: JPEG })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(await world(false).draft(actor("OWNER"), { bytes: JPEG })).toEqual({ ok: false, error: { type: "NOT_CONFIGURED" } });
    expect(asked).toEqual([]);
  });
});
