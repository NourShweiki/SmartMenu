import type { Clock } from "@/application/ports/system";
import type { SessionAtTable, TableSessionRepository } from "@/application/ports/table-session-repository";
import { err, ok, type Result } from "@/domain/shared/result";
import {
  effectiveSessionStatus,
  moveSessionTo,
  permissionToMoveSessionTo,
  type SessionError,
  type SessionStatus,
  type TableSessionId,
} from "@/domain/table-session/table-session";
import { requirePermission, type ForbiddenError, type StaffActor } from "../permissions";

export type MoveTableSessionError =
  | SessionError
  | ForbiddenError
  | { type: "SESSION_NOT_FOUND" }
  /** Someone else moved the visit first (or the database refused this user). Reload and look again. */
  | { type: "CONFLICT" };

/**
 * Moves a table visit along: the floor signals "ready to pay" (OPEN -> PAYMENT_REQUESTED, permission
 * `orders:confirm`: waiter, manager, owner), the cashier closes it after payment or ends it by hand (-> CLOSED,
 * permission `payments:close`: cashier, manager, owner). The database enforces the same split and the same moves,
 * so this never relies on the screen alone.
 *
 * A visit that ran out of time already counts as CLOSED (`effectiveSessionStatus`): "ready to pay" is refused for
 * it like for any closed visit. Closing it is still allowed, and useful: it brings the stored record in line
 * (status and end time) with what everyone already sees.
 */
export function makeMoveTableSession(deps: { sessions: TableSessionRepository; clock: Clock }) {
  return async (
    actor: StaffActor,
    input: { sessionId: TableSessionId; to: SessionStatus },
  ): Promise<Result<SessionAtTable, MoveTableSessionError>> => {
    const allowed = requirePermission(actor, permissionToMoveSessionTo(input.to));
    if (!allowed.ok) return allowed;

    const [found] = await deps.sessions.findWithTables(actor.restaurantId, [input.sessionId]);
    if (!found || found.session.restaurantId !== actor.restaurantId) return err({ type: "SESSION_NOT_FOUND" });

    const now = deps.clock.now();
    const stored = found.session;
    // Closing works from what is stored; everything else from what the visit effectively is.
    const from = input.to === "CLOSED" ? stored : { ...stored, status: effectiveSessionStatus(stored, now) };
    const moved = moveSessionTo(from, input.to, now);
    if (!moved.ok) return moved;

    const saved = await deps.sessions.updateStatus(actor.restaurantId, stored.id, stored.status, input.to);
    if (!saved) return err({ type: "CONFLICT" });
    return ok({ session: moved.value, tableLabel: found.tableLabel });
  };
}
