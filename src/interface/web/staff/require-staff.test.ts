import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Site } from "@/interface/web/current-site";

// The guard in front of EVERY staff page and staff Server Action (architecture-rules: "the tenant never comes from
// the request body"). Next's notFound()/redirect() end the request by throwing; the fakes throw the same way.
const fake = vi.hoisted(() => ({
  site: { kind: "platform" } as Site,
  staff: { ok: false } as { ok: boolean; value?: unknown },
  getStaffContext: vi.fn(),
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
vi.mock("@/infrastructure/container", () => ({ getStaffContext: fake.getStaffContext }));

const { requireStaff } = await import("./require-staff");

const GRILL = { id: "11111111-1111-4000-8000-000000000001", slug: "demo-dinein" };
const WAITER = { userId: "aaaa0001-0000-4000-8000-000000000002", role: "WAITER", mustChangePassword: false };

beforeEach(() => {
  fake.site = { kind: "restaurant", restaurant: GRILL } as unknown as Site;
  fake.staff = { ok: true, value: WAITER };
  fake.getStaffContext.mockReset().mockImplementation(async () => fake.staff);
});

describe("requireStaff", () => {
  it("lets a signed-in member of THIS restaurant in, with the restaurant taken from the address", async () => {
    await expect(requireStaff("en")).resolves.toEqual({ restaurant: GRILL, staff: WAITER });
    expect(fake.getStaffContext).toHaveBeenCalledWith({ restaurantId: GRILL.id });
  });

  it("does not exist on the platform's own address or an unknown restaurant address (404)", async () => {
    for (const site of [{ kind: "platform" }, { kind: "unknown" }] as Site[]) {
      fake.site = site;
      await expect(requireStaff("en")).rejects.toThrow("NOT_FOUND");
    }
    expect(fake.getStaffContext).not.toHaveBeenCalled();
  });

  it("sends somebody who is not signed in, or not staff here, to this restaurant's login page", async () => {
    fake.staff = { ok: false };
    await expect(requireStaff("ar")).rejects.toThrow("REDIRECT /ar/staff/login");
  });

  it("sends somebody with a temporary password to 'change my password', from everywhere", async () => {
    fake.staff = { ok: true, value: { ...WAITER, mustChangePassword: true } };
    await expect(requireStaff("en")).rejects.toThrow("REDIRECT /en/staff/password");
  });

  it("lets a temporary password through only where the page asks for it (the change-password page itself)", async () => {
    fake.staff = { ok: true, value: { ...WAITER, mustChangePassword: true } };
    await expect(requireStaff("en", { allowTemporaryPassword: true })).resolves.toMatchObject({ restaurant: GRILL });
  });
});
