import { describe, expect, it } from "vitest";
import type { AccountDirectory } from "@/application/ports/account-directory";
import type { UserId } from "@/application/ports/auth-gateway";
import type { StaffAccountPolicy, StaffMember, StaffRepository } from "@/application/ports/staff-repository";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import { err, ok } from "@/domain/shared/result";
import {
  makeAddStaffMember,
  makeChangeStaffRole,
  makeIssueStaffPassword,
  makeListStaff,
  makeRemoveStaffMember,
  type TeamActor,
} from "./staff-use-cases";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const id = (n: number) => `aaaa0001-0000-4000-8000-00000000000${n}` as UserId;
const OWNER = id(1);
const MANAGER = id(2);
const WAITER = id(3);
const CASHIER = id(4);
const FORMER = id(8); // has an account, belongs to no restaurant
const ELSEWHERE = id(9); // works at another restaurant

const owner: TeamActor = { restaurantId: GRILL, role: "OWNER", userId: OWNER };
const manager: TeamActor = { restaurantId: GRILL, role: "MANAGER", userId: MANAGER };
const waiter: TeamActor = { restaurantId: GRILL, role: "WAITER", userId: WAITER };
const cashier: TeamActor = { restaurantId: GRILL, role: "CASHIER", userId: CASHIER };
const joinedAt = new Date("2026-10-12T08:00:00Z");

/** A restaurant with one of each role, the accounts that exist on the platform, and a record of what happened. */
function world(options: { refuseWrites?: boolean; breakAdd?: boolean } = {}) {
  const members = new Map<UserId, StaffMember>(
    ([[OWNER, "OWNER"], [MANAGER, "MANAGER"], [WAITER, "WAITER"], [CASHIER, "CASHIER"]] as [UserId, Role][]).map(([userId, role]) => [
      userId,
      { userId, role, email: `${role.toLowerCase()}@grill.test`, joinedAt },
    ]),
  );
  const emails = new Map<string, UserId>([...members.values()].map((m) => [m.email, m.userId] as [string, UserId]));
  emails.set("former@grill.test", FORMER);
  emails.set("waiter@other.test", ELSEWHERE);
  const log = { passwords: new Map<UserId, string>(), removedAccounts: [] as UserId[], made: 0 };

  const staff: StaffRepository = {
    list: async () => [...members.values()],
    async add(_restaurantId, userId, role) {
      if (options.breakAdd) throw new Error("database is down");
      if (options.refuseWrites) return false;
      const email = [...emails].find(([, u]) => u === userId)?.[0] ?? "";
      members.set(userId, { userId, role, email, joinedAt });
      return true;
    },
    async changeRole(_restaurantId, userId, role) {
      const member = members.get(userId);
      if (!member || options.refuseWrites) return false;
      members.set(userId, { ...member, role });
      return true;
    },
    async remove(_restaurantId, userId) {
      return !options.refuseWrites && members.delete(userId);
    },
  };
  const accounts: AccountDirectory = {
    async create(email, password) {
      if (email === "refused@bad..test") return err({ type: "INVALID_EMAIL" });
      if (emails.has(email)) return err({ type: "EMAIL_TAKEN" });
      const userId = id(5 + log.made++) as UserId;
      emails.set(email, userId);
      log.passwords.set(userId, password);
      return ok({ userId });
    },
    async setTemporaryPassword(userId, password) {
      log.passwords.set(userId, password);
    },
    clearTemporaryPassword: async () => {},
    async remove(userId) {
      log.removedAccounts.push(userId);
      for (const [email, u] of emails) if (u === userId) emails.delete(email);
    },
  };
  const policy: StaffAccountPolicy = {
    findUnattached: async (_actorId, _restaurantId, email) => (email === "former@grill.test" ? FORMER : null),
    isResettable: async (_actorId, _restaurantId, userId) => userId !== ELSEWHERE && members.get(userId)?.role !== "OWNER",
  };
  const passwords = { newPassword: () => `temp-${log.passwords.size + 1}` };
  return { deps: { staff, accounts, policy, passwords }, members, log };
}

describe("listing the staff", () => {
  it("is for the owner and the manager", async () => {
    const { deps } = world();
    expect((await makeListStaff(deps)(owner)).ok).toBe(true);
    const listed = await makeListStaff(deps)(manager);
    expect(listed.ok && listed.value.map((m) => m.role)).toEqual(["OWNER", "MANAGER", "WAITER", "CASHIER"]);
    for (const actor of [waiter, cashier]) expect(await makeListStaff(deps)(actor)).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
  });
});

describe("adding a member", () => {
  it("makes an account with a temporary password and adds it with the chosen role", async () => {
    const { deps, members, log } = world();
    const result = await makeAddStaffMember(deps)(owner, { email: "  New.Waiter@Grill.test ", role: "WAITER" });
    expect(result).toEqual({ ok: true, value: { email: "new.waiter@grill.test", role: "WAITER", temporaryPassword: "temp-1" } });
    const added = [...members.values()].find((m) => m.email === "new.waiter@grill.test");
    expect(added?.role).toBe("WAITER");
    expect(log.passwords.get(added!.userId)).toBe("temp-1");
  });

  it("lets a manager add managers, waiters and cashiers, and nobody add an owner", async () => {
    const { deps } = world();
    for (const role of ["MANAGER", "WAITER", "CASHIER"]) {
      expect((await makeAddStaffMember(deps)(manager, { email: `${role}-2@grill.test`, role })).ok).toBe(true);
    }
    for (const actor of [owner, manager]) {
      expect(await makeAddStaffMember(deps)(actor, { email: "boss@grill.test", role: "OWNER" })).toEqual({ ok: false, error: { type: "INVALID_ROLE" } });
    }
    expect(await makeAddStaffMember(deps)(owner, { email: "x@grill.test", role: "CHEF" })).toEqual({ ok: false, error: { type: "INVALID_ROLE" } });
  });

  it("takes somebody on again whose account belongs to no restaurant, with a new temporary password", async () => {
    const { deps, members, log } = world();
    const result = await makeAddStaffMember(deps)(owner, { email: "former@grill.test", role: "CASHIER" });
    expect(result).toEqual({ ok: true, value: { email: "former@grill.test", role: "CASHIER", temporaryPassword: "temp-1" } });
    expect(members.get(FORMER)?.role).toBe("CASHIER");
    expect(log.passwords.get(FORMER)).toBe("temp-1");
    expect(log.made).toBe(0); // no second account for the same person
  });

  it("refuses an email that works elsewhere, a member of this restaurant, and a bad address", async () => {
    const { deps, members, log } = world();
    const add = makeAddStaffMember(deps);
    expect(await add(owner, { email: "waiter@other.test", role: "WAITER" })).toEqual({ ok: false, error: { type: "EMAIL_TAKEN" } });
    expect(await add(owner, { email: "Cashier@Grill.test", role: "WAITER" })).toEqual({ ok: false, error: { type: "ALREADY_MEMBER" } });
    expect(await add(owner, { email: "not an email", role: "WAITER" })).toEqual({ ok: false, error: { type: "INVALID_EMAIL" } });
    expect(await add(owner, { email: "refused@bad..test", role: "WAITER" })).toEqual({ ok: false, error: { type: "INVALID_EMAIL" } });
    expect(members.size).toBe(4);
    expect(log.passwords.size).toBe(0); // nobody's password was touched
  });

  it("is refused for waiters and cashiers before anything is made", async () => {
    const { deps, log } = world();
    for (const actor of [waiter, cashier]) {
      expect(await makeAddStaffMember(deps)(actor, { email: "friend@grill.test", role: "MANAGER" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    }
    expect(log.made).toBe(0);
  });

  it("removes a brand-new account again when it cannot join", async () => {
    const refused = world({ refuseWrites: true });
    expect(await makeAddStaffMember(refused.deps)(owner, { email: "new@grill.test", role: "WAITER" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(refused.log.removedAccounts).toHaveLength(1);

    const broken = world({ breakAdd: true });
    await expect(makeAddStaffMember(broken.deps)(owner, { email: "new@grill.test", role: "WAITER" })).rejects.toThrow("database is down");
    expect(broken.log.removedAccounts).toHaveLength(1);

    // An existing account that cannot join keeps its password: nothing about it was changed.
    const former = world({ refuseWrites: true });
    expect(await makeAddStaffMember(former.deps)(owner, { email: "former@grill.test", role: "WAITER" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(former.log.passwords.size).toBe(0);
    expect(former.log.removedAccounts).toEqual([]);
  });
});

describe("changing a role and removing a member", () => {
  it("changes a member's role", async () => {
    const { deps, members } = world();
    const result = await makeChangeStaffRole(deps)(manager, { userId: WAITER, role: "CASHIER" });
    expect(result.ok && result.value.role).toBe("CASHIER");
    expect(members.get(WAITER)?.role).toBe("CASHIER");
  });

  it("removes a member", async () => {
    const { deps, members } = world();
    expect((await makeRemoveStaffMember(deps)(owner, { userId: CASHIER })).ok).toBe(true);
    expect(members.has(CASHIER)).toBe(false);
  });

  it("never on oneself, never on an owner, never to owner, only for a member of this restaurant", async () => {
    const { deps, members } = world();
    const change = makeChangeStaffRole(deps);
    const remove = makeRemoveStaffMember(deps);
    expect(await change(owner, { userId: OWNER, role: "MANAGER" })).toEqual({ ok: false, error: { type: "CANNOT_CHANGE_SELF" } });
    expect(await remove(manager, { userId: MANAGER })).toEqual({ ok: false, error: { type: "CANNOT_CHANGE_SELF" } });
    expect(await change(manager, { userId: OWNER, role: "WAITER" })).toEqual({ ok: false, error: { type: "OWNER_PROTECTED" } });
    expect(await remove(manager, { userId: OWNER })).toEqual({ ok: false, error: { type: "OWNER_PROTECTED" } });
    expect(await change(owner, { userId: MANAGER, role: "OWNER" })).toEqual({ ok: false, error: { type: "INVALID_ROLE" } });
    expect(await remove(owner, { userId: ELSEWHERE })).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
    expect(await remove(owner, { userId: "not-an-id" })).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
    for (const actor of [waiter, cashier]) {
      expect(await change(actor, { userId: MANAGER, role: "WAITER" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
      expect(await remove(actor, { userId: MANAGER })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    }
    expect([...members.values()].map((m) => m.role)).toEqual(["OWNER", "MANAGER", "WAITER", "CASHIER"]); // nothing changed
  });

  it("never reports a change the database did not make", async () => {
    const { deps } = world({ refuseWrites: true });
    expect(await makeChangeStaffRole(deps)(owner, { userId: WAITER, role: "CASHIER" })).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
    expect(await makeRemoveStaffMember(deps)(owner, { userId: WAITER })).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
  });
});

describe("a new temporary password for a member", () => {
  it("is set and returned once", async () => {
    const { deps, log } = world();
    expect(await makeIssueStaffPassword(deps)(manager, { userId: WAITER })).toEqual({ ok: true, value: { email: "waiter@grill.test", temporaryPassword: "temp-1" } });
    expect(log.passwords.get(WAITER)).toBe("temp-1");
  });

  it("never for oneself, an owner, a stranger, or by a waiter", async () => {
    const { deps, log } = world();
    const issue = makeIssueStaffPassword(deps);
    expect(await issue(owner, { userId: OWNER })).toEqual({ ok: false, error: { type: "CANNOT_CHANGE_SELF" } });
    expect(await issue(manager, { userId: OWNER })).toEqual({ ok: false, error: { type: "OWNER_PROTECTED" } });
    expect(await issue(owner, { userId: ELSEWHERE })).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
    expect(await issue(waiter, { userId: CASHIER })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(log.passwords.size).toBe(0);
  });

  it("is refused when the account opens more than this restaurant", async () => {
    const { deps, log } = world();
    const strict = { ...deps, policy: { ...deps.policy, isResettable: async () => false } };
    expect(await makeIssueStaffPassword(strict)(owner, { userId: WAITER })).toEqual({ ok: false, error: { type: "NOT_RESETTABLE" } });
    expect(log.passwords.size).toBe(0);
  });
});
