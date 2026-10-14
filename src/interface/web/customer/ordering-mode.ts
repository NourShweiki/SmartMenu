import type { PublicSession } from "@/application/ports/table-session-gateway";
import type { OrderingMode } from "./cart-panel";

/**
 * What this phone is doing at the restaurant, worked out the same way for every guest page (the home page and the
 * menu), from the restaurant's settings and the visit the phone holds (null when it holds none):
 *  - `live`: the visit if it is still going (a closed one counts as none);
 *  - `atTable`: a live TABLE visit where table ordering applies (dine-in is on, or takeout is off so a table is all
 *    there is);
 *  - `ordering`: which way the phone orders. A live table visit orders for the table; where the restaurant takes
 *    takeout orders any other phone orders takeout (into its open pickup visit, or anew); otherwise nothing can be
 *    ordered ("none"). Mirrors `placeCustomerOrder`.
 */
export function resolveVisit(
  settings: { readonly dineInEnabled: boolean; readonly takeoutEnabled: boolean },
  session: PublicSession | null,
): { live: PublicSession | null; atTable: boolean; ordering: OrderingMode } {
  const live = session && session.status !== "CLOSED" ? session : null;
  const atTable = live?.kind === "TABLE" && (settings.dineInEnabled || !settings.takeoutEnabled);
  const ordering: OrderingMode = atTable ? "table" : !settings.takeoutEnabled ? "none" : live?.kind === "PICKUP" && live.status === "OPEN" ? "pickupOpen" : "pickup";
  return { live, atTable, ordering };
}
