import { describe, expect, it } from "vitest";
import type { SettingsRepository } from "@/application/ports/settings-repository";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { ROLES } from "@/domain/restaurant/role";
import { presetSettings, type RestaurantSettings } from "@/domain/restaurant/settings";
import { makeGetRestaurantSettings } from "./get-restaurant-settings";
import { makeUpdateRestaurantSettings } from "./update-restaurant-settings";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const owner = { restaurantId: R, role: "OWNER" } as const;

function fakeRepo(initial: RestaurantSettings | null, accepts = true) {
  const state = { settings: initial, updates: [] as RestaurantSettings[] };
  const repo: SettingsRepository = {
    find: async () => state.settings,
    update: async (_id, s) => {
      state.updates.push(s);
      if (accepts) state.settings = s;
      return accepts;
    },
  };
  return { repo, state };
}

describe("get restaurant settings", () => {
  it("returns the settings to the owner", async () => {
    const { repo } = fakeRepo(presetSettings("dine-in"));
    expect(await makeGetRestaurantSettings({ settings: repo })(owner)).toEqual({ ok: true, value: presetSettings("dine-in") });
  });

  it("is forbidden for every role except the owner", async () => {
    const { repo } = fakeRepo(presetSettings("dine-in"));
    for (const role of ROLES.filter((r) => r !== "OWNER")) {
      expect(await makeGetRestaurantSettings({ settings: repo })({ restaurantId: R, role })).toEqual({
        ok: false,
        error: { type: "FORBIDDEN" },
      });
    }
  });

  it("reports a missing settings row", async () => {
    const { repo } = fakeRepo(null);
    expect(await makeGetRestaurantSettings({ settings: repo })(owner)).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
  });
});

describe("update restaurant settings", () => {
  const changed: RestaurantSettings = { ...presetSettings("dine-in"), takeoutEnabled: false, taxRateBp: 1000, defaultLanguage: "en" };

  it("saves valid settings for the owner", async () => {
    const { repo, state } = fakeRepo(presetSettings("dine-in"));
    expect(await makeUpdateRestaurantSettings({ settings: repo })(owner, changed)).toEqual({ ok: true, value: changed });
    expect(state.updates).toEqual([changed]);
  });

  it("never writes for a role without permission", async () => {
    const { repo, state } = fakeRepo(presetSettings("dine-in"));
    for (const role of ROLES.filter((r) => r !== "OWNER")) {
      expect(await makeUpdateRestaurantSettings({ settings: repo })({ restaurantId: R, role }, changed)).toEqual({
        ok: false,
        error: { type: "FORBIDDEN" },
      });
    }
    expect(state.updates).toEqual([]);
  });

  it("rejects settings with no order mode or a bad rate, without writing", async () => {
    const { repo, state } = fakeRepo(presetSettings("dine-in"));
    const update = makeUpdateRestaurantSettings({ settings: repo });
    const none = { ...changed, dineInEnabled: false, takeoutEnabled: false, deliveryEnabled: false };
    expect(await update(owner, none)).toEqual({ ok: false, error: { type: "NO_ORDER_MODE_ENABLED" } });
    expect(await update(owner, { ...changed, taxRateBp: 10_001 })).toEqual({
      ok: false,
      error: { type: "INVALID_RATE", field: "taxRateBp" },
    });
    expect(await update(owner, { ...changed, serviceChargeBp: 12.5 })).toEqual({
      ok: false,
      error: { type: "INVALID_RATE", field: "serviceChargeBp" },
    });
    expect(state.updates).toEqual([]);
  });

  it("does not report success when the database refused the change", async () => {
    const { repo } = fakeRepo(presetSettings("dine-in"), false);
    expect(await makeUpdateRestaurantSettings({ settings: repo })(owner, changed)).toEqual({
      ok: false,
      error: { type: "NOT_FOUND" },
    });
  });
});
