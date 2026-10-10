import type { TableError } from "@/domain/table-session/table-session";
import type { ForbiddenError, StaffActor } from "../permissions";
import { requirePermission } from "../permissions";

/** The signed-in staff member acting on tables. */
export type TableActor = StaffActor;

export type TableUseCaseError = TableError | ForbiddenError | { type: "NOT_FOUND" } | { type: "LABEL_TAKEN" };

/** Managing tables and QR codes is `tables:manage` (OWNER and MANAGER). */
export const requireTablePermission = (actor: TableActor) => requirePermission(actor, "tables:manage");
