// Staff accounts managed by the owner and manager, against the LOCAL Supabase: real accounts, the real row policies
// and the membership guard. Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI.
// It works in a restaurant it makes itself ("itest-staff-..."), removed before and after with every account it made.
// The demo restaurants and accounts are only read.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserId } from "@/application/ports/auth-gateway";
import {
  makeAddStaffMember,
  makeChangeStaffRole,
  makeIssueStaffPassword,
  makeListStaff,
  makeRemoveStaffMember,
  type TeamActor,
} from "@/application/use-cases/staff/staff-use-cases";
import { createRestaurant, type RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import { newTemporaryPassword } from "../random-token";
import { createPublicClient, createServiceClient } from "./client";
import { SupabaseAccountDirectory } from "./supabase-account-directory";
import { SupabaseAuthGateway } from "./supabase-auth-gateway";
import { SupabaseMembershipRepository } from "./supabase-membership-repository";
import { SupabaseRestaurantDirectory } from "./supabase-restaurant-directory";
import { SupabaseStaffAccountPolicy, SupabaseStaffRepository } from "./supabase-staff-repository";

const DEMO_PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql
const FOUNDER = "cccc0001-0000-4000-8000-000000000001" as UserId;
const GRILL_OWNER = "aaaa0001-0000-4000-8000-000000000001" as UserId;
const run = crypto.randomUUID().slice(0, 8);
const mail = (who: string) => `itest-staff-${run}-${who}@test.local`;

let restaurantId: RestaurantId;
let ownerId: UserId;
let ownerPassword: string;

async function sweep() {
  const service = createServiceClient();
  const { error } = await service.from("restaurants").delete().like("slug", "itest-staff-%"); // members go with it
  if (error) throw error;
  const { data, error: listError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  for (const user of data.users) {
    if (user.email?.startsWith("itest-staff-")) await service.auth.admin.deleteUser(user.id);
  }
}

/** The use cases wired as the container wires them, for whoever signs in with this email and password. */
async function teamFor(email: string, password: string, role: Role) {
  const db = createPublicClient(); // in-memory session
  const signedIn = await db.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const service = createServiceClient();
  const deps = {
    staff: new SupabaseStaffRepository(db),
    accounts: new SupabaseAccountDirectory(service),
    policy: new SupabaseStaffAccountPolicy(service),
    passwords: { newPassword: newTemporaryPassword },
  };
  const actor: TeamActor = { restaurantId, role, userId: signedIn.data.user.id as UserId };
  return { deps, actor, db };
}

const canSignIn = async (email: string, password: string) => !(await createPublicClient().auth.signInWithPassword({ email, password })).error;

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("staff accounts against local Supabase", () => {
  beforeAll(async () => {
    await sweep();
    // A restaurant of its own, made the way the setup tool makes one.
    const service = createServiceClient();
    ownerPassword = newTemporaryPassword();
    const account = await new SupabaseAccountDirectory(service).create(mail("owner"), ownerPassword);
    if (!account.ok) throw new Error("could not make the test owner");
    ownerId = account.value.userId;
    const draft = createRestaurant(
      { slug: `itest-staff-${run}`, name: { en: "Staff Test", ar: "اختبار الموظفين" }, businessType: "dine-in" },
      { newId: () => crypto.randomUUID(), now: () => new Date() },
    );
    if (!draft.ok) throw new Error("bad test restaurant");
    restaurantId = draft.value.id;
    const stored = await new SupabaseRestaurantDirectory(service).create(FOUNDER, draft.value, ownerId);
    if (!stored.ok) throw new Error(`could not store the test restaurant: ${stored.error.type}`);
  });
  afterAll(sweep);

  it("the owner adds staff, changes a role, issues a password, removes and re-hires; each with a working temporary password", async () => {
    const owner = await teamFor(mail("owner"), ownerPassword, "OWNER");
    const add = makeAddStaffMember(owner.deps);

    // A new waiter: an account with a temporary password, a member of this restaurant only.
    const waiter = await add(owner.actor, { email: `  ${mail("waiter").toUpperCase()} `, role: "WAITER" });
    if (!waiter.ok) throw new Error(`expected a waiter, got ${JSON.stringify(waiter.error)}`);
    expect(waiter.value.email).toBe(mail("waiter"));
    const asWaiter = createPublicClient();
    expect((await asWaiter.auth.signInWithPassword({ email: mail("waiter"), password: waiter.value.temporaryPassword })).error).toBeNull();
    const waiterUser = await new SupabaseAuthGateway(asWaiter).currentUser();
    expect(waiterUser?.mustChangePassword).toBe(true);
    const waiterId = waiterUser!.userId;
    const memberships = new SupabaseMembershipRepository(asWaiter);
    expect(await memberships.findRole(restaurantId, waiterId)).toBe("WAITER");
    expect(await memberships.findRole("11111111-1111-4000-8000-000000000001" as RestaurantId, waiterId)).toBeNull();

    const listed = await makeListStaff(owner.deps)(owner.actor);
    expect(listed.ok && listed.value.map((m) => [m.role, m.email])).toEqual([
      ["OWNER", mail("owner")],
      ["WAITER", mail("waiter")],
    ]);

    // The same email again, an email that works at another restaurant, and a founder's: all refused, nothing touched.
    expect(await add(owner.actor, { email: mail("waiter"), role: "CASHIER" })).toEqual({ ok: false, error: { type: "ALREADY_MEMBER" } });
    expect(await add(owner.actor, { email: "waiter@demo-dinein.test", role: "WAITER" })).toEqual({ ok: false, error: { type: "EMAIL_TAKEN" } });
    expect(await add(owner.actor, { email: "founder@demo-platform.test", role: "MANAGER" })).toEqual({ ok: false, error: { type: "EMAIL_TAKEN" } });
    expect(await canSignIn("waiter@demo-dinein.test", DEMO_PASSWORD)).toBe(true);
    expect(await canSignIn("founder@demo-platform.test", DEMO_PASSWORD)).toBe(true);

    // Waiter -> manager. The manager then adds a cashier.
    const promoted = await makeChangeStaffRole(owner.deps)(owner.actor, { userId: waiterId, role: "MANAGER" });
    expect(promoted.ok && promoted.value.role).toBe("MANAGER");
    const manager = await teamFor(mail("waiter"), waiter.value.temporaryPassword, "MANAGER");
    const cashier = await makeAddStaffMember(manager.deps)(manager.actor, { email: mail("cashier"), role: "CASHIER" });
    if (!cashier.ok) throw new Error(`expected a cashier, got ${JSON.stringify(cashier.error)}`);
    const cashierId = (await makeListStaff(owner.deps)(owner.actor).then((r) => (r.ok ? r.value : []))).find((m) => m.email === mail("cashier"))!.userId;

    // A new temporary password for the cashier: the first one is dead, the new one works.
    const reissued = await makeIssueStaffPassword(manager.deps)(manager.actor, { userId: cashierId });
    if (!reissued.ok) throw new Error(`expected a password, got ${JSON.stringify(reissued.error)}`);
    expect(reissued.value.email).toBe(mail("cashier"));
    expect(await canSignIn(mail("cashier"), cashier.value.temporaryPassword)).toBe(false);
    expect(await canSignIn(mail("cashier"), reissued.value.temporaryPassword)).toBe(true);

    // Removing takes the cashier out of the restaurant; the account stays, and can be hired again as the same person.
    expect((await makeRemoveStaffMember(owner.deps)(owner.actor, { userId: cashierId })).ok).toBe(true);
    expect(await new SupabaseMembershipRepository(createServiceClient()).findRole(restaurantId, cashierId)).toBeNull();
    expect(await canSignIn(mail("cashier"), reissued.value.temporaryPassword)).toBe(true); // the account itself is still there
    const rehired = await add(owner.actor, { email: mail("cashier"), role: "WAITER" });
    if (!rehired.ok) throw new Error(`expected a re-hire, got ${JSON.stringify(rehired.error)}`);
    expect(await canSignIn(mail("cashier"), reissued.value.temporaryPassword)).toBe(false);
    expect(await canSignIn(mail("cashier"), rehired.value.temporaryPassword)).toBe(true);
    expect(await new SupabaseMembershipRepository(createServiceClient()).findRole(restaurantId, cashierId)).toBe("WAITER"); // same account
  });

  it("the rules hold in the database too: not yourself, not the owner, not without the role, not across restaurants", async () => {
    const owner = await teamFor(mail("owner"), ownerPassword, "OWNER");
    const staff = await makeListStaff(owner.deps)(owner.actor);
    if (!staff.ok) throw new Error("the owner should see the staff");
    const manager = staff.value.find((m) => m.role === "MANAGER")!;
    const waiter = staff.value.find((m) => m.role === "WAITER")!;

    // Use cases first: the answers the screens get.
    expect(await makeRemoveStaffMember(owner.deps)(owner.actor, { userId: ownerId })).toEqual({ ok: false, error: { type: "CANNOT_CHANGE_SELF" } });
    expect(await makeIssueStaffPassword(owner.deps)(owner.actor, { userId: GRILL_OWNER })).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
    expect(await makeListStaff(owner.deps)({ ...owner.actor, role: "WAITER" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });

    // Then the store itself, as if a screen had forgotten its checks.
    expect(await owner.deps.staff.remove(restaurantId, ownerId)).toBe(false); // oneself
    expect(await owner.deps.staff.changeRole(restaurantId, ownerId, "MANAGER")).toBe(false);
    // (The manager's and the waiter's passwords are not known here: each gets a fresh one to sign in with.)
    const fresh = await makeIssueStaffPassword(owner.deps)(owner.actor, { userId: manager.userId });
    if (!fresh.ok) throw new Error("the owner should be able to reset the manager");
    const managerSide = await teamFor(manager.email, fresh.value.temporaryPassword, "MANAGER");
    expect(await managerSide.deps.staff.remove(restaurantId, ownerId)).toBe(false); // a manager and the owner's row
    expect(await managerSide.deps.staff.changeRole(restaurantId, waiter.userId, "OWNER")).toBe(false); // nobody is made owner by a manager
    expect(await managerSide.deps.staff.remove(restaurantId, manager.userId)).toBe(false); // oneself

    const waiterPassword = await makeIssueStaffPassword(owner.deps)(owner.actor, { userId: waiter.userId });
    if (!waiterPassword.ok) throw new Error("the owner should be able to reset the waiter");
    const waiterSide = await teamFor(waiter.email, waiterPassword.value.temporaryPassword, "WAITER");
    expect(await waiterSide.deps.staff.list(restaurantId)).toEqual([]); // no staff list for a waiter
    expect(await waiterSide.deps.staff.remove(restaurantId, manager.userId)).toBe(false);
    expect(await waiterSide.deps.staff.add(restaurantId, GRILL_OWNER, "WAITER")).toBe(false);
    expect(await waiterSide.deps.policy.findUnattached(waiter.userId, restaurantId, mail("nobody"))).toBeNull();
    expect(await waiterSide.deps.policy.isResettable(waiter.userId, restaurantId, manager.userId)).toBe(false);

    // Across restaurants: this owner is nobody at Demo Grill, and Demo Grill's staff cannot be touched from here.
    expect(await owner.deps.staff.list("11111111-1111-4000-8000-000000000001" as RestaurantId)).toEqual([]);
    expect(await owner.deps.policy.isResettable(ownerId, restaurantId, GRILL_OWNER)).toBe(false);
    expect(await owner.deps.policy.isResettable(ownerId, "11111111-1111-4000-8000-000000000001" as RestaurantId, GRILL_OWNER)).toBe(false);
    expect(await canSignIn("owner@demo-dinein.test", DEMO_PASSWORD)).toBe(true);

    // Everybody is still where they were.
    const after = await makeListStaff(owner.deps)(owner.actor);
    expect(after.ok && after.value.map((m) => m.role)).toEqual(["OWNER", "MANAGER", "WAITER"]);
  });
});
