import { describe, expect, it } from "vitest";
import { buildSetupChecklist, type SetupFacts } from "./setup-checklist";

const NOTHING: SetupFacts = { orderableItems: 0, activeTables: 0, hasLogo: false, hasDetails: false, staffBesidesOwners: 0, hasOrders: false };
const state = (facts: SetupFacts, dineInEnabled: boolean) => buildSetupChecklist(facts, { dineInEnabled }).items.map((i) => `${i.id}:${i.done ? "done" : "open"}${i.optional ? "?" : ""}`);

describe("buildSetupChecklist", () => {
  it("a brand-new dine-in restaurant has everything to do", () => {
    const checklist = buildSetupChecklist(NOTHING, { dineInEnabled: true });
    expect(state(NOTHING, true)).toEqual(["menu:open", "tables:open", "branding:open", "staff:open?", "testOrder:open"]);
    expect(checklist.ready).toBe(false);
  });

  it("a takeout-only restaurant has no tables to set up", () => {
    expect(state(NOTHING, false)).toEqual(["menu:open", "branding:open", "staff:open?", "testOrder:open"]);
    // ...and is ready without any, however many it happens to have.
    const done = { ...NOTHING, orderableItems: 3, hasDetails: true, hasOrders: true };
    expect(buildSetupChecklist(done, { dineInEnabled: false }).ready).toBe(true);
    expect(buildSetupChecklist(done, { dineInEnabled: true }).ready).toBe(false); // the same shop with tables switched on
  });

  it("each line ticks itself from what the restaurant has", () => {
    expect(state({ ...NOTHING, orderableItems: 1 }, true)[0]).toBe("menu:done");
    expect(state({ ...NOTHING, activeTables: 2 }, true)[1]).toBe("tables:done");
    expect(state({ ...NOTHING, hasLogo: true }, true)[2]).toBe("branding:done");
    expect(state({ ...NOTHING, hasDetails: true }, true)[2]).toBe("branding:done");
    expect(state({ ...NOTHING, staffBesidesOwners: 1 }, true)[3]).toBe("staff:done?");
    expect(state({ ...NOTHING, hasOrders: true }, true)[4]).toBe("testOrder:done");
  });

  it("is ready when everything but the optional staff line is done", () => {
    const facts = { ...NOTHING, orderableItems: 5, activeTables: 4, hasLogo: true, hasOrders: true };
    expect(buildSetupChecklist(facts, { dineInEnabled: true }).ready).toBe(true);
    expect(buildSetupChecklist({ ...facts, hasOrders: false }, { dineInEnabled: true }).ready).toBe(false);
    expect(buildSetupChecklist({ ...facts, orderableItems: 0 }, { dineInEnabled: true }).ready).toBe(false); // everything sold out again
  });
});
