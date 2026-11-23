import { beforeEach, describe, expect, it, vi } from "vitest";

// The preview-link routes (PROJECT_SPEC.md §5). The browser tests cover them end to end but are not in CI, so the
// rules that keep them safe are pinned here: off unless switched on, platform address only, real restaurants only,
// only our own pages, the table visit forgotten when the restaurant changes, and the cookie's flags.
const fake = vi.hoisted(() => ({
  enabled: true,
  platform: true,
  origin: "https://smart-menu-eta-eosin.vercel.app",
  cookies: new Map<string, string>(),
  getPublicRestaurant: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (fake.cookies.has(n) ? { value: fake.cookies.get(n) } : undefined) }),
}));
vi.mock("@/infrastructure/container", () => ({
  previewLinksEnabled: () => fake.enabled,
  getPublicRestaurant: fake.getPublicRestaurant,
}));
vi.mock("@/interface/web/current-site", () => ({
  PREVIEW_COOKIE: "smartmenu_preview_site",
  isPlatformAddress: async () => fake.platform,
}));
vi.mock("@/interface/web/tables/scan-url", () => ({ getRequestOrigin: async () => fake.origin }));

const { GET: open } = await import("./[slug]/[[...rest]]/route");
const { GET: exit } = await import("./route");

const VISIT = "smartmenu_table_session";
const PREVIEW = "smartmenu_preview_site";
const go = (slug: string, rest?: string[]) => open(new Request("https://x/"), { params: Promise.resolve({ slug, rest }) });
const setCookie = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));

beforeEach(() => {
  fake.enabled = true;
  fake.platform = true;
  fake.origin = "https://smart-menu-eta-eosin.vercel.app";
  fake.cookies = new Map();
  fake.getPublicRestaurant.mockReset().mockImplementation(async ({ slug }: { slug: string }) =>
    slug === "demo-dinein" || slug === "demo-takeout"
      ? { ok: true, value: { slug, settings: { defaultLanguage: "ar" } } }
      : { ok: false, error: { type: "RESTAURANT_NOT_FOUND" } },
  );
});

describe("/r/<slug>/<path> (open a preview)", () => {
  it("remembers the restaurant and sends the visitor to the normal page", async () => {
    const res = await go("Demo-Dinein", ["en", "staff", "login"]);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://smart-menu-eta-eosin.vercel.app/en/staff/login");
    const cookie = setCookie(res, PREVIEW)!;
    expect(cookie).toContain("smartmenu_preview_site=demo-dinein");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Secure/i);
  });

  it("opens the restaurant's default language without a path", async () => {
    expect((await go("demo-takeout")).headers.get("location")).toBe("https://smart-menu-eta-eosin.vercel.app/ar");
  });

  it("forgets the table visit when switching to another restaurant, keeps it for the same one", async () => {
    fake.cookies.set(PREVIEW, "demo-dinein");
    expect(setCookie(await go("demo-takeout"), VISIT)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(setCookie(await go("demo-dinein"), VISIT)).toBeUndefined();
  });

  it("does not exist when previews are off, or on a restaurant's real address", async () => {
    fake.enabled = false;
    expect((await go("demo-dinein")).status).toBe(404);
    fake.enabled = true;
    fake.platform = false;
    expect((await go("demo-dinein")).status).toBe(404);
    expect(fake.getPublicRestaurant).not.toHaveBeenCalled();
  });

  it("refuses unknown or malformed restaurants and paths outside the restaurant's pages", async () => {
    expect((await go("nobody-here")).status).toBe(404);
    expect((await go("../etc")).status).toBe(404);
    expect((await go("demo-dinein", ["setup"])).status).toBe(404);
    expect((await go("demo-dinein", ["", "evil.example"])).status).toBe(404);
  });
});

describe("/r (leave the preview)", () => {
  it("forgets the restaurant and its table visit and goes home", async () => {
    const res = await exit();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://smart-menu-eta-eosin.vercel.app/");
    expect(setCookie(res, PREVIEW)).toBeDefined();
    expect(setCookie(res, VISIT)).toBeDefined();
  });

  it("does not exist when previews are off, or on a restaurant's real address (it would end a guest's visit)", async () => {
    fake.enabled = false;
    expect((await exit()).status).toBe(404);
    fake.enabled = true;
    fake.platform = false;
    const res = await exit();
    expect(res.status).toBe(404);
    expect(setCookie(res, VISIT)).toBeUndefined();
  });
});
