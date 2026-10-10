import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err, ok, type Result } from "@/domain/shared/result";

export type TableId = string & { readonly __brand: "TableId" };
/** One visit at one table. Several customer devices can share it (spec §4). */
export type TableSessionId = string & { readonly __brand: "TableSessionId" };

// ─── Tables ─────────────────────────────────────────────────────────────

/**
 * A physical table with its printed QR code. The QR code carries `token`, NOT the label: the token is random and
 * unguessable (nobody can scan table 7 and guess the link for table 8), and it keeps working when the owner renames
 * or renumbers the table (the spec says QR codes must stay stable). A lost or leaked code is replaced by giving the
 * table a new token.
 */
export type Table = {
  readonly id: TableId;
  readonly restaurantId: RestaurantId;
  /** Short number or name shown to customers and staff: "7", "Terrace 2". The "Table" word is added by the screen. */
  readonly label: string;
  readonly token: string;
  /** Inactive tables keep their label but their QR code stops working (e.g. a table taken out for the winter). */
  readonly isActive: boolean;
  readonly createdAt: Date;
  /** Soft delete: frees the label for reuse; orders of past sessions keep pointing at the table. */
  readonly deletedAt: Date | null;
};

export const MAX_LABEL_LENGTH = 20;
/** 22+ URL-safe characters = at least 128 bits of randomness (a v4 UUID has 122). */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

export type TableError =
  | { type: "LABEL_REQUIRED" }
  | { type: "LABEL_TOO_LONG"; max: number }
  | { type: "LABEL_INVALID" }
  | { type: "INVALID_TOKEN" }
  | { type: "DELETED" };

/** Ids and tokens are injected so the domain stays pure and testable. */
export type TableDeps = { newId: () => string; newToken: () => string };

/**
 * Trims and tidies what the owner typed (inner runs of spaces collapse to one). Letters of any language, digits,
 * and a few separators are fine; control characters and line breaks are not.
 */
export function validateLabel(raw: string): Result<string, TableError> {
  const label = raw.trim().replace(/\s+/g, " ");
  if (label === "") return err({ type: "LABEL_REQUIRED" });
  if ([...label].length > MAX_LABEL_LENGTH) return err({ type: "LABEL_TOO_LONG", max: MAX_LABEL_LENGTH });
  // C0 and C1 control characters (U+0000-001F, U+007F-009F) and markup characters. The database refuses the same
  // set, so a bad label is reported here as a normal validation error instead of failing later at the database.
  if (/[\u0000-\u001f\u007f-\u009f<>]/.test(label)) return err({ type: "LABEL_INVALID" });
  return ok(label);
}

/** Two labels clash when they only differ by case or spacing ("Terrace 2" = "terrace  2"). */
export const labelKey = (label: string): string => label.trim().replace(/\s+/g, " ").toLowerCase();

export function createTable(restaurantId: RestaurantId, rawLabel: string, deps: TableDeps, now: Date): Result<Table, TableError> {
  const label = validateLabel(rawLabel);
  if (!label.ok) return label;
  const token = deps.newToken();
  if (!TOKEN_PATTERN.test(token)) return err({ type: "INVALID_TOKEN" });
  return ok({ id: deps.newId() as TableId, restaurantId, label: label.value, token, isActive: true, createdAt: now, deletedAt: null });
}

export function renameTable(table: Table, rawLabel: string): Result<Table, TableError> {
  if (table.deletedAt) return err({ type: "DELETED" });
  const label = validateLabel(rawLabel);
  return label.ok ? ok({ ...table, label: label.value }) : label;
}

export function setTableActive(table: Table, isActive: boolean): Result<Table, TableError> {
  return table.deletedAt ? err({ type: "DELETED" }) : ok({ ...table, isActive });
}

/** A new QR code for the table: the old printed one stops working at once. */
export function regenerateToken(table: Table, deps: Pick<TableDeps, "newToken">): Result<Table, TableError> {
  if (table.deletedAt) return err({ type: "DELETED" });
  const token = deps.newToken();
  return TOKEN_PATTERN.test(token) ? ok({ ...table, token }) : err({ type: "INVALID_TOKEN" });
}

export function deleteTable(table: Table, now: Date): Result<Table, TableError> {
  return table.deletedAt ? err({ type: "DELETED" }) : ok({ ...table, deletedAt: now });
}

/** Can a customer start or join a session here right now? */
export const isScannable = (table: Table): boolean => table.isActive && !table.deletedAt;

// ─── Sessions ───────────────────────────────────────────────────────────

/** Spec §4 and the data-model skill: OPEN -> PAYMENT_REQUESTED -> CLOSED. */
export const SESSION_STATUSES = ["OPEN", "PAYMENT_REQUESTED", "CLOSED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export type TableSession = {
  readonly id: TableSessionId;
  readonly restaurantId: RestaurantId;
  readonly tableId: TableId;
  readonly status: SessionStatus;
  readonly startedAt: Date;
  /** Set when the session is CLOSED. */
  readonly endedAt: Date | null;
};

export type SessionError = { type: "INVALID_TRANSITION"; from: SessionStatus; to: SessionStatus };

/**
 * Allowed moves. A waiter signals "ready to pay" (OPEN -> PAYMENT_REQUESTED), the cashier closes after payment
 * (PAYMENT_REQUESTED -> CLOSED), and staff may end a session by hand (OPEN -> CLOSED, e.g. the guests left without
 * ordering, or the timer ran out). ASSUMPTION to confirm: once payment is requested the session does not reopen.
 */
const NEXT: Record<SessionStatus, readonly SessionStatus[]> = {
  OPEN: ["PAYMENT_REQUESTED", "CLOSED"],
  PAYMENT_REQUESTED: ["CLOSED"],
  CLOSED: [],
};

export function moveSessionTo(session: TableSession, to: SessionStatus, now: Date): Result<TableSession, SessionError> {
  if (!NEXT[session.status].includes(to)) return err({ type: "INVALID_TRANSITION", from: session.status, to });
  return ok({ ...session, status: to, endedAt: to === "CLOSED" ? now : null });
}

/**
 * New orders are only accepted while the session is OPEN. ASSUMPTION to confirm: after "ready to pay" is signalled
 * the bill is final, so ordering stops until the table is closed and a new visit starts.
 */
export const acceptsOrders = (session: Pick<TableSession, "status">): boolean => session.status === "OPEN";

/**
 * The permission needed to move a session to a status (mirrors the database policy): the floor signals payment
 * (`orders:confirm`), the cashier closes (`payments:close`). Owner and manager hold both.
 */
export function permissionToMoveSessionTo(status: SessionStatus): "orders:confirm" | "payments:close" {
  return status === "PAYMENT_REQUESTED" ? "orders:confirm" : "payments:close";
}
