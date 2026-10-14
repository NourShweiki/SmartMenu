import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Site } from "@/interface/web/current-site";

// The guard in front of every page and action of the founders' setup tool (PROJECT_SPEC.md §7: only founders
// onboard; the tool lives on the platform's own address only). notFound()/redirect() throw, like Next's.
const fake = vi.hoisted(() => ({
  site: { kind: "platform" } as Site,
  founder: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("@/interface/web/current-site", () => ({ getCurrentSite: async () => fake.site }));
vi.mock("@/infrastructure/container", () => ({ platform: { founder: fake.founder } }));

const { requireFounder } = await import("./require-founder");

const FOUNDER = { userId: "cccc0001-0000-4000-8000-000000000001" };

beforeEach(() => {
  fake.site = { kind: "platform" };
  fake.founder.mockReset().mockResolvedValue({ ok: true, value: FOUNDER });
});

describe("requireFounder", () => {
  it("lets a signed-in founder in on the platform's own address", async () => {
    await expect(requireFounder("en")).resolves.toEqual(FOUNDER);
  });

  it("does not exist on a restaurant's address, even for a founder (404)", async () => {
    fake.site = { kind: "restaurant", restaurant: { id: "11111111-1111-4000-8000-000000000001" } } as unknown as Site;
    await expect(requireFounder("en")).rejects.toThrow("NOT_FOUND");
    expect(fake.founder).not.toHaveBeenCalled();
  });

  it("does not exist on an unknown restaurant address either", async () => {
    fake.site = { kind: "unknown" };
    await expect(requireFounder("en")).rejects.toThrow("NOT_FOUND");
  });

  it("sends anybody who is not a founder (restaurant staff included) to the setup login", async () => {
    fake.founder.mockResolvedValue({ ok: false, error: { type: "NOT_A_FOUNDER" } });
    await expect(requireFounder("ar")).rejects.toThrow("REDIRECT /ar/setup/login");
  });
});
