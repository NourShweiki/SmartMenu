import { describe, expect, it } from "vitest";
import type { BrandingRecord, BrandingRepository } from "@/application/ports/branding-repository";
import type { PhotoStorage } from "@/application/ports/photo-storage";
import { DEFAULT_BRANDING, MAX_LOGO_BYTES, type BrandingInput } from "@/domain/restaurant/branding";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { ROLES } from "@/domain/restaurant/role";
import { makeGetBranding } from "./get-branding";
import { makeRemoveRestaurantLogo, makeSetRestaurantLogo } from "./set-restaurant-logo";
import { makeUpdateBranding } from "./update-branding";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const owner = { restaurantId: R, role: "OWNER" } as const;
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3]);

function fakeBranding(initial: BrandingRecord | null, accepts = true) {
  const state = { record: initial, saves: [] as BrandingRecord[], failWith: null as Error | null };
  const repo: BrandingRepository = {
    find: async () => state.record,
    save: async (_id, record) => {
      state.saves.push(record);
      if (state.failWith) throw state.failWith;
      if (accepts) state.record = record;
      return accepts;
    },
  };
  return { repo, state };
}

function fakeStorage() {
  const files = new Set<string>();
  const log: string[] = [];
  const storage: PhotoStorage = {
    upload: async (path) => {
      files.add(path);
      log.push(`upload ${path}`);
    },
    remove: async (path) => {
      files.delete(path);
      log.push(`remove ${path}`);
    },
    publicUrl: (path) => `https://files.test/${path}`,
  };
  return { storage, files, log };
}

const initial = (): BrandingRecord => ({ name: { en: "Demo Grill", ar: "مشاوي التجربة" }, branding: DEFAULT_BRANDING });
const input = (over: Partial<BrandingInput> = {}): BrandingInput => ({
  name: { en: "Demo Grill", ar: "مشاوي التجربة" },
  accent: "teal",
  tagline: { en: "Charcoal grills", ar: "" },
  about: { en: "", ar: "" },
  address: { en: "", ar: "" },
  phone: "+962 6 555 0100",
  openingHours: { en: "", ar: "" },
  ...over,
});
let n = 0;
const ids = { newId: () => `file-${++n}` };

describe("get branding", () => {
  it("returns the name and branding to the owner only", async () => {
    const { repo } = fakeBranding(initial());
    const get = makeGetBranding({ branding: repo });
    expect(await get(owner)).toEqual({ ok: true, value: initial() });
    for (const role of ROLES.filter((r) => r !== "OWNER")) {
      expect(await get({ restaurantId: R, role })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    }
  });

  it("reports a missing restaurant", async () => {
    expect(await makeGetBranding({ branding: fakeBranding(null).repo })(owner)).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
  });
});

describe("update branding", () => {
  it("saves the checked name and branding, keeping the logo", async () => {
    const withLogo = { ...initial(), branding: { ...DEFAULT_BRANDING, logoPath: `${R}/logo-old.png` } };
    const { repo, state } = fakeBranding(withLogo);
    const result = await makeUpdateBranding({ branding: repo })(owner, input({ name: { en: " New Name ", ar: "اسم" } }));
    expect(result).toMatchObject({ ok: true, value: { name: { en: "New Name", ar: "اسم" }, branding: { accent: "teal", logoPath: `${R}/logo-old.png` } } });
    expect(state.saves).toHaveLength(1);
  });

  it("never saves for a role without permission, or for invalid input", async () => {
    const { repo, state } = fakeBranding(initial());
    const update = makeUpdateBranding({ branding: repo });
    for (const role of ROLES.filter((r) => r !== "OWNER")) {
      expect(await update({ restaurantId: R, role }, input())).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    }
    expect(await update(owner, input({ accent: "#ff0000" }))).toEqual({ ok: false, error: { type: "INVALID_ACCENT" } });
    expect(await update(owner, input({ phone: "call me" }))).toEqual({ ok: false, error: { type: "INVALID_PHONE" } });
    expect(await update(owner, input({ name: { en: "", ar: "ع" } }))).toEqual({ ok: false, error: { type: "NAME_REQUIRED", lang: "en" } });
    expect(state.saves).toEqual([]);
  });

  it("does not report success when the database refused the save", async () => {
    const { repo } = fakeBranding(initial(), false);
    expect(await makeUpdateBranding({ branding: repo })(owner, input())).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
  });
});

describe("set restaurant logo", () => {
  it("uploads the new logo, points the branding at it, then deletes the old file", async () => {
    const old = `${R}/logo-old.png`;
    const { repo, state } = fakeBranding({ ...initial(), branding: { ...DEFAULT_BRANDING, logoPath: old } });
    const { storage, files, log } = fakeStorage();
    files.add(old);

    const result = await makeSetRestaurantLogo({ branding: repo, logos: storage, ids })(owner, { bytes: PNG });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const path = result.value.branding.logoPath!;
    expect(path).toMatch(new RegExp(`^${R}/logo-file-\\d+\\.png$`));
    expect(state.record!.branding.logoPath).toBe(path);
    expect([...files]).toEqual([path]); // the old file is gone, the new one stays
    expect(log).toEqual([`upload ${path}`, `remove ${old}`]); // new file first, old one last
  });

  it("refuses a bad file before touching storage: empty, too large, not an image (SVG), wrong role", async () => {
    const { repo, state } = fakeBranding(initial());
    const { storage, log } = fakeStorage();
    const set = makeSetRestaurantLogo({ branding: repo, logos: storage, ids });
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");

    expect(await set(owner, { bytes: new Uint8Array(0) })).toEqual({ ok: false, error: { type: "PHOTO_EMPTY" } });
    expect(await set(owner, { bytes: new Uint8Array(MAX_LOGO_BYTES + 1).fill(0x89) })).toEqual({ ok: false, error: { type: "PHOTO_TOO_LARGE" } });
    expect(await set(owner, { bytes: svg })).toEqual({ ok: false, error: { type: "PHOTO_TYPE_NOT_ALLOWED" } });
    expect(await set({ restaurantId: R, role: "MANAGER" }, { bytes: PNG })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(log).toEqual([]);
    expect(state.saves).toEqual([]);
  });

  it("removes the freshly uploaded file when the save fails (no orphan)", async () => {
    for (const mode of ["refused", "throws"] as const) {
      const { repo, state } = fakeBranding(initial(), mode !== "refused");
      if (mode === "throws") state.failWith = new Error("db down");
      const { storage, files } = fakeStorage();
      const run = makeSetRestaurantLogo({ branding: repo, logos: storage, ids })(owner, { bytes: PNG });
      if (mode === "throws") await expect(run).rejects.toThrow("db down");
      else expect(await run).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
      expect(files.size).toBe(0);
    }
  });
});

describe("remove restaurant logo", () => {
  it("clears the logo in the branding and deletes the file", async () => {
    const path = `${R}/logo-old.png`;
    const { repo, state } = fakeBranding({ ...initial(), branding: { ...DEFAULT_BRANDING, logoPath: path } });
    const { storage, files } = fakeStorage();
    files.add(path);

    const result = await makeRemoveRestaurantLogo({ branding: repo, logos: storage })(owner);
    expect(result).toMatchObject({ ok: true, value: { branding: { logoPath: null } } });
    expect(state.record!.branding.logoPath).toBeNull();
    expect(files.size).toBe(0);
  });

  it("is owner-only and keeps the file when the save is refused", async () => {
    const path = `${R}/logo-old.png`;
    const { repo } = fakeBranding({ ...initial(), branding: { ...DEFAULT_BRANDING, logoPath: path } }, false);
    const { storage, files } = fakeStorage();
    files.add(path);
    const remove = makeRemoveRestaurantLogo({ branding: repo, logos: storage });
    expect(await remove({ restaurantId: R, role: "WAITER" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(await remove(owner)).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
    expect(files.has(path)).toBe(true);
  });
});
