import { describe, expect, it } from "vitest";
import type { PublicSession } from "@/application/ports/table-session-gateway";
import type { TableSessionId } from "@/domain/table-session/table-session";
import { resolveVisit } from "./ordering-mode";

const id = "s-1" as TableSessionId;
const table = (status: PublicSession["status"] = "OPEN"): PublicSession => ({ sessionId: id, kind: "TABLE", tableLabel: "7", status });
const pickup = (status: PublicSession["status"] = "OPEN"): PublicSession => ({ sessionId: id, kind: "PICKUP", customerName: "Sara", status });
const both = { dineInEnabled: true, takeoutEnabled: true };
const dineInOnly = { dineInEnabled: true, takeoutEnabled: false };
const takeoutOnly = { dineInEnabled: false, takeoutEnabled: true };
const neither = { dineInEnabled: false, takeoutEnabled: false };

describe("resolveVisit", () => {
  it("a live table visit orders for the table", () => {
    expect(resolveVisit(both, table())).toMatchObject({ atTable: true, ordering: "table" });
    expect(resolveVisit(both, table("PAYMENT_REQUESTED"))).toMatchObject({ atTable: true, ordering: "table" }); // still a live visit
    expect(resolveVisit(dineInOnly, table())).toMatchObject({ atTable: true, ordering: "table" });
  });

  it("takeout applies to any phone without a table visit, and a live pickup visit takes more orders", () => {
    expect(resolveVisit(both, null)).toMatchObject({ live: null, atTable: false, ordering: "pickup" });
    expect(resolveVisit(takeoutOnly, null)).toMatchObject({ ordering: "pickup" });
    expect(resolveVisit(both, pickup())).toMatchObject({ atTable: false, ordering: "pickupOpen" });
    expect(resolveVisit(both, pickup("PAYMENT_REQUESTED"))).toMatchObject({ ordering: "pickup" }); // not open any more: a new one
  });

  it("a closed visit counts as none", () => {
    expect(resolveVisit(both, table("CLOSED"))).toMatchObject({ live: null, atTable: false, ordering: "pickup" });
    expect(resolveVisit(dineInOnly, table("CLOSED"))).toMatchObject({ live: null, atTable: false, ordering: "none" });
  });

  it("a table visit does not order for the table when dine-in is off but takeout is on (the phone orders takeout)", () => {
    expect(resolveVisit(takeoutOnly, table())).toMatchObject({ atTable: false, ordering: "pickup" });
  });

  it("nothing can be ordered when neither is on, or when only dine-in is on and there is no table visit", () => {
    expect(resolveVisit(neither, null)).toMatchObject({ ordering: "none" });
    expect(resolveVisit(dineInOnly, null)).toMatchObject({ ordering: "none" });
  });
});
