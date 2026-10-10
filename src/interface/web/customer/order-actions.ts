"use server";

import { orders, tableSessions } from "@/infrastructure/container";
import { getCurrentSite } from "@/interface/web/current-site";
import { placeCustomerOrder, type PlaceOrderOutcome } from "./place-order-model";
import { readSessionId } from "./session-cookie";

/**
 * The cart's "Place order" button. Public (guests have no account), so the only thing taken from the browser is
 * the cart itself: restaurant from the host, table session from the HttpOnly cookie; see `placeCustomerOrder`.
 */
export async function placeOrderAction(cart: unknown): Promise<PlaceOrderOutcome> {
  const site = await getCurrentSite();
  if (site.kind !== "restaurant") return { ok: false, problem: "failed" };
  return placeCustomerOrder(
    { findSession: tableSessions.find, place: orders.place },
    { restaurant: site.restaurant, sessionId: await readSessionId(), cart },
  );
}
