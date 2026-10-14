import { beforeEach, describe, expect, it, vi } from "vitest";

// Which restaurant a request is for (PROJECT_SPEC.md §5 "one codebase resolves the restaurant from the incoming
// domain"). It is the ONLY source of the tenant for pages and actions, so a mistake here shows one restaurant's
// pages on another's address.
const fake = vi.hoisted(() => ({
  headers: new Headers(),
  rootDomain: "localhost",
  getPublicRestaurant: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => fake.headers }));
// React's per-request cache only exists while React renders on the server; here every call is a fresh request.
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/infrastructure/container", () => ({
  appRootDomain: () => fake.rootDomain,
  getPublicRestaurant: fake.getPublicRestaurant,
}));

const { getCurrentSite, restaurantOrigin } = await import("./current-site");

const GRILL = { id: "11111111-1111-4000-8000-000000000001", slug: "demo-dinein" };

function request(headers: Record<string, string>) {
  fake.headers = new Headers(headers);
}

beforeEach(() => {
  fake.rootDomain = "localhost";
  fake.getPublicRestaurant.mockReset().mockImplementation(async ({ slug }: { slug: string }) =>
    slug === GRILL.slug ? { ok: true, value: GRILL } : { ok: false, error: { type: "RESTAURANT_NOT_FOUND" } },
  );
});

describe("getCurrentSite", () => {
  it("finds the restaurant from its subdomain", async () => {
    request({ host: "demo-dinein.localhost:3000" });
    await expect(getCurrentSite()).resolves.toEqual({ kind: "restaurant", restaurant: GRILL });
    expect(fake.getPublicRestaurant).toHaveBeenCalledWith({ slug: "demo-dinein" });
  });

  it("is the platform on the bare root domain (no restaurant is looked up)", async () => {
    request({ host: "localhost:3000" });
    await expect(getCurrentSite()).resolves.toEqual({ kind: "platform" });
    expect(fake.getPublicRestaurant).not.toHaveBeenCalled();
  });

  it("is unknown for a subdomain no restaurant owns", async () => {
    request({ host: "nobody-here.localhost:3000" });
    await expect(getCurrentSite()).resolves.toEqual({ kind: "unknown" });
  });

  it("prefers x-forwarded-host (the address the visitor typed) over host, and takes its first value", async () => {
    request({ host: "localhost:3000", "x-forwarded-host": "demo-dinein.localhost:3000, proxy.internal" });
    await expect(getCurrentSite()).resolves.toMatchObject({ kind: "restaurant" });
  });

  it("never takes a restaurant from another root domain", async () => {
    request({ host: "demo-dinein.evil.example" });
    const site = await getCurrentSite();
    expect(site.kind).not.toBe("restaurant");
  });
});

describe("restaurantOrigin", () => {
  it("builds the restaurant's address from the configured root domain, keeping the request's port", async () => {
    request({ host: "localhost:3000" });
    await expect(restaurantOrigin("demo-takeout")).resolves.toBe("http://demo-takeout.localhost:3000");
  });

  it("uses https in production and the forwarded scheme when there is one", async () => {
    fake.rootDomain = "smartmenu.jo";
    request({ host: "smartmenu.jo" });
    await expect(restaurantOrigin("grill")).resolves.toBe("https://grill.smartmenu.jo");
    request({ host: "smartmenu.jo", "x-forwarded-proto": "http" });
    await expect(restaurantOrigin("grill")).resolves.toBe("http://grill.smartmenu.jo");
  });

  it("ignores a forwarded scheme that is not http or https", async () => {
    fake.rootDomain = "smartmenu.jo";
    request({ host: "smartmenu.jo", "x-forwarded-proto": "javascript" });
    await expect(restaurantOrigin("grill")).resolves.toBe("https://grill.smartmenu.jo");
  });
});
