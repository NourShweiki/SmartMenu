/**
 * The owner's setup checklist (spec §7): what a new restaurant still needs before it can take its first order.
 * Nothing here is stored. Every line is worked out from what the restaurant HAS, so it ticks itself the moment the
 * thing exists, and unticks itself if it goes away again.
 */

/** What the restaurant has right now. */
export type SetupFacts = {
  /** Items a customer can order at this moment (visible, in a visible category, not sold out). */
  readonly orderableItems: number;
  /** Tables whose QR code works (active, not deleted). */
  readonly activeTables: number;
  readonly hasLogo: boolean;
  /** Any of the written details: tagline, about, address, phone, opening hours. */
  readonly hasDetails: boolean;
  /** Managers, waiters and cashiers (everybody who is not an owner). */
  readonly staffBesidesOwners: number;
  /** At least one order was ever placed, whatever became of it. */
  readonly hasOrders: boolean;
};

export const SETUP_ITEMS = ["menu", "tables", "branding", "staff", "testOrder"] as const;
export type SetupItemId = (typeof SETUP_ITEMS)[number];

export type SetupItem = {
  readonly id: SetupItemId;
  readonly done: boolean;
  /** Nice to have: it never keeps the checklist open on its own (a one-person shop has no staff to add). */
  readonly optional: boolean;
};

export type SetupChecklist = {
  readonly items: readonly SetupItem[];
  /** Every line that is not optional is done: the restaurant is ready. */
  readonly ready: boolean;
};

/**
 * Tables and QR codes only count where the restaurant takes orders at its tables: a takeout-only shop has none to
 * set up, so the line is not there at all.
 */
export function buildSetupChecklist(facts: SetupFacts, settings: { readonly dineInEnabled: boolean }): SetupChecklist {
  const items: SetupItem[] = [
    { id: "menu", done: facts.orderableItems > 0, optional: false },
    ...(settings.dineInEnabled ? [{ id: "tables" as const, done: facts.activeTables > 0, optional: false }] : []),
    { id: "branding", done: facts.hasLogo || facts.hasDetails, optional: false },
    { id: "staff", done: facts.staffBesidesOwners > 0, optional: true },
    { id: "testOrder", done: facts.hasOrders, optional: false },
  ];
  return { items, ready: items.every((item) => item.done || item.optional) };
}
