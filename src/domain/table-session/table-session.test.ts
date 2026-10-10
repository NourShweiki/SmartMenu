import { describe, expect, it } from "vitest";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { can } from "@/domain/restaurant/role";
import {
  acceptsOrders,
  isSessionExpired,
  SESSION_MAX_AGE_HOURS,
  createTable,
  deleteTable,
  isScannable,
  labelKey,
  MAX_LABEL_LENGTH,
  moveSessionTo,
  permissionToMoveSessionTo,
  regenerateToken,
  renameTable,
  SESSION_STATUSES,
  setTableActive,
  TOKEN_PATTERN,
  validateLabel,
  type Table,
  type TableId,
  type TableSession,
  type TableSessionId,
} from "./table-session";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const NOW = new Date("2026-10-10T12:00:00Z");
const LATER = new Date("2026-10-10T14:00:00Z");
let n = 0;
const token = () => `tok${String(++n).padStart(3, "0")}-abcdefghijklmnopqrstuv`; // 22+ url-safe chars
const deps = { newId: () => `table-${++n}`, newToken: token };
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};
const table = (label = "7"): Table => unwrap(createTable(R, label, deps, NOW));

describe("validateLabel", () => {
  it("accepts numbers and short names in any language, trimmed and tidied", () => {
    expect(validateLabel("7")).toEqual({ ok: true, value: "7" });
    expect(validateLabel("  Terrace   2 ")).toEqual({ ok: true, value: "Terrace 2" });
    expect(validateLabel("الشرفة ٢")).toEqual({ ok: true, value: "الشرفة ٢" });
    expect(validateLabel("A-1 / VIP")).toMatchObject({ ok: true });
    expect(validateLabel("x".repeat(MAX_LABEL_LENGTH))).toMatchObject({ ok: true });
  });

  it("refuses empty, too long, and control characters or markup", () => {
    expect(validateLabel("   ")).toEqual({ ok: false, error: { type: "LABEL_REQUIRED" } });
    expect(validateLabel("x".repeat(MAX_LABEL_LENGTH + 1))).toEqual({ ok: false, error: { type: "LABEL_TOO_LONG", max: MAX_LABEL_LENGTH } });
    for (const bad of ["a\u0000b", "a\u0007b", "a\u007fb", "a\u0085b", "a\u009fb", "<b>7</b>", "7>"]) {
      expect(validateLabel(bad), bad).toEqual({ ok: false, error: { type: "LABEL_INVALID" } });
    }
    // A line break is whitespace, so it just becomes a space (never a second line on a printed card).
    expect(validateLabel("Table\n7")).toEqual({ ok: true, value: "Table 7" });
  });

  it("counts characters, not UTF-16 units (an emoji is one)", () => {
    expect(validateLabel("🍽️".repeat(5)).ok).toBe(true);
  });

  it("labelKey makes labels that differ only by case or spacing clash", () => {
    expect(labelKey("Terrace 2")).toBe(labelKey(" terrace   2 "));
    expect(labelKey("7")).not.toBe(labelKey("8"));
  });
});

describe("tables", () => {
  it("creates an active table with a random token, not derived from the label", () => {
    const a = table("7");
    const b = table("7"); // same label, separate call: tokens never repeat
    expect(a).toMatchObject({ restaurantId: R, label: "7", isActive: true, deletedAt: null, createdAt: NOW });
    expect(TOKEN_PATTERN.test(a.token)).toBe(true);
    expect(a.token).not.toBe(b.token);
    expect(a.token).not.toContain("7-");
    expect(a.id).not.toBe(b.id);
  });

  it("refuses an invalid label and a weak or malformed token", () => {
    expect(createTable(R, "", deps, NOW)).toEqual({ ok: false, error: { type: "LABEL_REQUIRED" } });
    for (const weak of ["short", "has spaces in it 1234567890", "x".repeat(21), "x".repeat(65), "tab\tle-0123456789012345678", ""]) {
      expect(createTable(R, "7", { ...deps, newToken: () => weak }, NOW), weak).toEqual({ ok: false, error: { type: "INVALID_TOKEN" } });
    }
  });

  it("renames without touching the token (printed QR codes keep working)", () => {
    const t = table("7");
    const renamed = unwrap(renameTable(t, "  Window 3 "));
    expect(renamed).toMatchObject({ label: "Window 3", token: t.token, id: t.id });
    expect(renameTable(t, "")).toEqual({ ok: false, error: { type: "LABEL_REQUIRED" } });
  });

  it("regenerating the token invalidates the old code, keeps everything else", () => {
    const t = table("7");
    const fresh = unwrap(regenerateToken(t, deps));
    expect(fresh.token).not.toBe(t.token);
    expect(fresh).toMatchObject({ id: t.id, label: "7" });
    expect(regenerateToken(t, { newToken: () => "weak" })).toEqual({ ok: false, error: { type: "INVALID_TOKEN" } });
  });

  it("deactivated and deleted tables cannot be scanned; deleted ones cannot be changed", () => {
    const t = table();
    expect(isScannable(t)).toBe(true);
    const off = unwrap(setTableActive(t, false));
    expect(isScannable(off)).toBe(false);
    expect(isScannable(unwrap(setTableActive(off, true)))).toBe(true);

    const gone = unwrap(deleteTable(t, LATER));
    expect(gone.deletedAt).toEqual(LATER);
    expect(isScannable({ ...gone, isActive: true })).toBe(false);
    for (const result of [renameTable(gone, "9"), setTableActive(gone, true), regenerateToken(gone, deps), deleteTable(gone, LATER)]) {
      expect(result).toEqual({ ok: false, error: { type: "DELETED" } });
    }
  });
});

describe("sessions", () => {
  const open = (): TableSession => ({
    id: "s-1" as TableSessionId,
    restaurantId: R,
    tableId: "t-1" as TableId,
    status: "OPEN",
    startedAt: NOW,
    endedAt: null,
  });

  it("goes OPEN -> PAYMENT_REQUESTED -> CLOSED and stamps the end time when it closes", () => {
    const requested = unwrap(moveSessionTo(open(), "PAYMENT_REQUESTED", LATER));
    expect(requested).toMatchObject({ status: "PAYMENT_REQUESTED", endedAt: null });
    const closed = unwrap(moveSessionTo(requested, "CLOSED", LATER));
    expect(closed).toMatchObject({ status: "CLOSED", endedAt: LATER, startedAt: NOW });
  });

  it("lets staff end an OPEN session by hand", () => {
    expect(unwrap(moveSessionTo(open(), "CLOSED", LATER))).toMatchObject({ status: "CLOSED", endedAt: LATER });
  });

  it("never goes back, repeats, or leaves CLOSED", () => {
    const requested = unwrap(moveSessionTo(open(), "PAYMENT_REQUESTED", LATER));
    const closed = unwrap(moveSessionTo(requested, "CLOSED", LATER));
    expect(moveSessionTo(requested, "OPEN", LATER)).toEqual({ ok: false, error: { type: "INVALID_TRANSITION", from: "PAYMENT_REQUESTED", to: "OPEN" } });
    expect(moveSessionTo(open(), "OPEN", LATER).ok).toBe(false);
    expect(moveSessionTo(requested, "PAYMENT_REQUESTED", LATER).ok).toBe(false);
    for (const to of SESSION_STATUSES) expect(moveSessionTo(closed, to, LATER).ok).toBe(false);
  });

  it("accepts new orders only while OPEN", () => {
    expect(SESSION_STATUSES.filter((status) => acceptsOrders({ status, startedAt: NOW }, NOW))).toEqual(["OPEN"]);
  });

  it("runs out 2 hours after it starts (to the millisecond), and then takes no orders", () => {
    const hours = (h: number) => new Date(NOW.getTime() + h * 60 * 60 * 1000);
    expect(SESSION_MAX_AGE_HOURS).toBe(2);
    expect(isSessionExpired(NOW, hours(1.99))).toBe(false);
    expect(isSessionExpired(NOW, new Date(hours(2).getTime() - 1))).toBe(false);
    expect(isSessionExpired(NOW, hours(2))).toBe(true);
    expect(isSessionExpired(NOW, hours(24))).toBe(true);
    expect(acceptsOrders({ status: "OPEN", startedAt: NOW }, hours(1))).toBe(true);
    expect(acceptsOrders({ status: "OPEN", startedAt: NOW }, hours(2))).toBe(false); // still flagged OPEN, but out of time
  });

  it("splits the work by role as the order flow does: floor signals payment, cashier closes", () => {
    expect(permissionToMoveSessionTo("PAYMENT_REQUESTED")).toBe("orders:confirm");
    expect(permissionToMoveSessionTo("CLOSED")).toBe("payments:close");
    expect(can("WAITER", permissionToMoveSessionTo("PAYMENT_REQUESTED"))).toBe(true);
    expect(can("WAITER", permissionToMoveSessionTo("CLOSED"))).toBe(false);
    expect(can("CASHIER", permissionToMoveSessionTo("CLOSED"))).toBe(true);
    expect(can("CASHIER", permissionToMoveSessionTo("PAYMENT_REQUESTED"))).toBe(false);
  });
});
