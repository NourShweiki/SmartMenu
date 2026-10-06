import { describe, expect, it } from "vitest";
import type { PublicRestaurant, RestaurantRepository } from "@/application/ports/restaurant-repository";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { presetSettings } from "@/domain/restaurant/settings";
import { makeGetPublicRestaurant } from "./get-public-restaurant";

const demo: PublicRestaurant = {
  id: "11111111-1111-4000-8000-000000000001" as RestaurantId,
  slug: "demo-dinein",
  name: { en: "Demo Grill", ar: "مشاوي التجربة" },
  settings: presetSettings("dine-in"),
};

function fakeRepo(rows: PublicRestaurant[]) {
  const calls: string[] = [];
  const repo: RestaurantRepository = {
    async findPublicBySlug(slug) {
      calls.push(slug);
      return rows.find((r) => r.slug === slug) ?? null;
    },
  };
  return { repo, calls };
}

describe("getPublicRestaurant", () => {
  it("returns the restaurant for a known slug", async () => {
    const { repo } = fakeRepo([demo]);
    const result = await makeGetPublicRestaurant({ restaurants: repo })({ slug: "demo-dinein" });
    expect(result).toEqual({ ok: true, value: demo });
  });

  it("normalises case and spaces before looking up", async () => {
    const { repo, calls } = fakeRepo([demo]);
    const result = await makeGetPublicRestaurant({ restaurants: repo })({ slug: "  Demo-DineIn " });
    expect(result.ok).toBe(true);
    expect(calls).toEqual(["demo-dinein"]);
  });

  it("returns RESTAURANT_NOT_FOUND for an unknown slug", async () => {
    const { repo } = fakeRepo([demo]);
    const result = await makeGetPublicRestaurant({ restaurants: repo })({ slug: "no-such-place" });
    expect(result).toEqual({ ok: false, error: { type: "RESTAURANT_NOT_FOUND" } });
  });

  it("does not query the database for a malformed slug", async () => {
    const { repo, calls } = fakeRepo([demo]);
    const result = await makeGetPublicRestaurant({ restaurants: repo })({ slug: "%" });
    expect(result).toEqual({ ok: false, error: { type: "RESTAURANT_NOT_FOUND" } });
    expect(calls).toEqual([]);
  });
});
