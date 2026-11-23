import { describe, expect, it } from "vitest";
import { resolveSiteSlug } from "./site";

const ROOT = "smart-menu-eta-eosin.vercel.app";
const on = (slug: string | null) => ({ enabled: true, slug });
const off = (slug: string | null) => ({ enabled: false, slug });

describe("resolveSiteSlug", () => {
  it("takes the restaurant from its subdomain, as before", () => {
    expect(resolveSiteSlug("demo-dinein.localhost:3000", "localhost", off(null))).toEqual({ slug: "demo-dinein", via: "host" });
  });

  it("lets a real subdomain win over a preview cookie", () => {
    expect(resolveSiteSlug("demo-dinein.localhost:3000", "localhost", on("demo-takeout"))).toEqual({
      slug: "demo-dinein",
      via: "host",
    });
  });

  it("uses the preview cookie on the bare root address when previews are switched on", () => {
    expect(resolveSiteSlug(ROOT, ROOT, on("demo-takeout"))).toEqual({ slug: "demo-takeout", via: "preview" });
    expect(resolveSiteSlug(`${ROOT}:443`, ROOT, on(" Demo-Dinein "))).toEqual({ slug: "demo-dinein", via: "preview" });
  });

  it("ignores the preview cookie when previews are switched off (the default)", () => {
    expect(resolveSiteSlug(ROOT, ROOT, off("demo-takeout"))).toBeNull();
  });

  it("is the platform on the root address without a preview", () => {
    expect(resolveSiteSlug(ROOT, ROOT, on(null))).toBeNull();
    expect(resolveSiteSlug(ROOT, ROOT, on(""))).toBeNull();
  });

  it("never previews on an address that is not this deployment's root", () => {
    expect(resolveSiteSlug("evil.example", ROOT, on("demo-dinein"))).toBeNull();
    expect(resolveSiteSlug(`x.${ROOT}.evil.example`, ROOT, on("demo-dinein"))).toBeNull();
    expect(resolveSiteSlug("anything", "", on("demo-dinein"))).toBeNull();
  });

  it("ignores a malformed or reserved slug in the cookie", () => {
    for (const slug of ["../admin", "a", "has space", "admin", "www", "x--y", "-lead"]) {
      expect(resolveSiteSlug(ROOT, ROOT, on(slug))).toBeNull();
    }
  });
});
