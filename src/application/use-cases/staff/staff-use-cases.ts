import type { AccountDirectory } from "@/application/ports/account-directory";
import type { UserId } from "@/application/ports/auth-gateway";
import type { StaffAccountPolicy, StaffMember, StaffRepository } from "@/application/ports/staff-repository";
import type { PasswordGenerator } from "@/application/ports/system";
import { isAssignableRole, type AssignableRole } from "@/domain/restaurant/role";
import { normalizeEmail } from "@/domain/shared/email";
import { err, ok, type Result } from "@/domain/shared/result";
import { isUuid } from "@/domain/shared/uuid";
import { requirePermission, type ForbiddenError, type StaffActor } from "../permissions";

/** The signed-in owner or manager acting on the restaurant's staff. The person matters here: nobody acts on themselves. */
export type TeamActor = StaffActor & { userId: UserId };

export type StaffError =
  | ForbiddenError
  | { type: "INVALID_ROLE" }
  | { type: "INVALID_EMAIL" }
  /** The email belongs to an account that cannot be taken on (it works at another restaurant, or is not staff at all). */
  | { type: "EMAIL_TAKEN" }
  | { type: "ALREADY_MEMBER" }
  | { type: "NOT_FOUND" }
  | { type: "CANNOT_CHANGE_SELF" }
  /** Owners are created, and their passwords reset, by the founders only. */
  | { type: "OWNER_PROTECTED" }
  | { type: "NOT_RESETTABLE" };

/** What whoever added (or reset) a member is shown ONCE, to pass on. */
export type StaffPasswordNotice = { email: string; temporaryPassword: string };

/** Managing staff is `staff:manage` (OWNER and MANAGER). */
const allowed = (actor: TeamActor) => requirePermission(actor, "staff:manage");

/**
 * The member an action is about: somebody else, of this restaurant, who is not an owner. Everything that changes a
 * member starts here, so the three rules are in one place (the database enforces the first and the last again).
 */
async function target(staff: StaffRepository, actor: TeamActor, userId: string): Promise<Result<StaffMember, StaffError>> {
  if (!isUuid(userId)) return err({ type: "NOT_FOUND" });
  if (userId.toLowerCase() === actor.userId) return err({ type: "CANNOT_CHANGE_SELF" });
  const member = (await staff.list(actor.restaurantId)).find((m) => m.userId === userId.toLowerCase());
  if (!member) return err({ type: "NOT_FOUND" });
  if (member.role === "OWNER") return err({ type: "OWNER_PROTECTED" });
  return ok(member);
}

/** The restaurant's staff with their emails, for the owner and the manager. */
export function makeListStaff(deps: { staff: StaffRepository }) {
  return async (actor: TeamActor): Promise<Result<StaffMember[], StaffError>> => {
    const may = allowed(actor);
    return may.ok ? ok(await deps.staff.list(actor.restaurantId)) : may;
  };
}

/**
 * Adds a manager, waiter or cashier by email. They get a sign-in account with a temporary password, returned once.
 *
 * An email that already has an account is only taken on when that account belongs to no restaurant (somebody who
 * was removed and is hired again): it then gets a new temporary password. An account that works elsewhere is
 * refused, because adding it would let this restaurant reset a password that opens the other one.
 */
export function makeAddStaffMember(deps: {
  staff: StaffRepository;
  accounts: AccountDirectory;
  policy: StaffAccountPolicy;
  passwords: PasswordGenerator;
}) {
  return async (actor: TeamActor, input: { email: string; role: string }): Promise<Result<StaffPasswordNotice & { role: AssignableRole }, StaffError>> => {
    const may = allowed(actor);
    if (!may.ok) return may;
    if (!isAssignableRole(input.role)) return err({ type: "INVALID_ROLE" });
    const role = input.role;
    const email = normalizeEmail(input.email);
    if (!email) return err({ type: "INVALID_EMAIL" });
    if ((await deps.staff.list(actor.restaurantId)).some((m) => m.email.toLowerCase() === email)) return err({ type: "ALREADY_MEMBER" });

    const temporaryPassword = deps.passwords.newPassword();
    const created = await deps.accounts.create(email, temporaryPassword);
    if (created.ok) {
      const userId = created.value.userId;
      // A brand-new account that then cannot join is removed again: a failed attempt leaves nothing behind.
      let joined: boolean;
      try {
        joined = await deps.staff.add(actor.restaurantId, userId, role);
      } catch (error) {
        await deps.accounts.remove(userId).catch(() => {});
        throw error;
      }
      if (!joined) {
        await deps.accounts.remove(userId);
        return err({ type: "FORBIDDEN" });
      }
      return ok({ email, role, temporaryPassword });
    }
    if (created.error.type !== "EMAIL_TAKEN") return created;

    const existing = await deps.policy.findUnattached(actor.userId, actor.restaurantId, email);
    if (!existing) return err({ type: "EMAIL_TAKEN" });
    // Join first, password second: if the second step fails the member is there and can be given a password again.
    if (!(await deps.staff.add(actor.restaurantId, existing, role))) return err({ type: "FORBIDDEN" });
    await deps.accounts.setTemporaryPassword(existing, temporaryPassword);
    return ok({ email, role, temporaryPassword });
  };
}

/** Makes a member a manager, waiter or cashier. Never oneself, never an owner. */
export function makeChangeStaffRole(deps: { staff: StaffRepository }) {
  return async (actor: TeamActor, input: { userId: string; role: string }): Promise<Result<StaffMember, StaffError>> => {
    const may = allowed(actor);
    if (!may.ok) return may;
    if (!isAssignableRole(input.role)) return err({ type: "INVALID_ROLE" });
    const member = await target(deps.staff, actor, input.userId);
    if (!member.ok) return member;
    if (member.value.role === input.role) return member;
    // Not changed (the database refused, or they were removed meanwhile): never report a change that did not happen.
    return (await deps.staff.changeRole(actor.restaurantId, member.value.userId, input.role)) ? ok({ ...member.value, role: input.role }) : err({ type: "NOT_FOUND" });
  };
}

/** Takes a member out of the restaurant. Their account stays (past orders still know who cancelled them). */
export function makeRemoveStaffMember(deps: { staff: StaffRepository }) {
  return async (actor: TeamActor, input: { userId: string }): Promise<Result<StaffMember, StaffError>> => {
    const may = allowed(actor);
    if (!may.ok) return may;
    const member = await target(deps.staff, actor, input.userId);
    if (!member.ok) return member;
    return (await deps.staff.remove(actor.restaurantId, member.value.userId)) ? member : err({ type: "NOT_FOUND" });
  };
}

/**
 * Gives a member a new temporary password (they forgot theirs, or the first one was never passed on). The old one
 * stops working at once. Only for somebody whose account opens nothing but this restaurant.
 */
export function makeIssueStaffPassword(deps: { staff: StaffRepository; accounts: Pick<AccountDirectory, "setTemporaryPassword">; policy: StaffAccountPolicy; passwords: PasswordGenerator }) {
  return async (actor: TeamActor, input: { userId: string }): Promise<Result<StaffPasswordNotice, StaffError>> => {
    const may = allowed(actor);
    if (!may.ok) return may;
    const member = await target(deps.staff, actor, input.userId);
    if (!member.ok) return member;
    if (!(await deps.policy.isResettable(actor.userId, actor.restaurantId, member.value.userId))) return err({ type: "NOT_RESETTABLE" });

    const temporaryPassword = deps.passwords.newPassword();
    await deps.accounts.setTemporaryPassword(member.value.userId, temporaryPassword);
    return ok({ email: member.value.email, temporaryPassword });
  };
}
