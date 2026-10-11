"use server";

import { cookies } from "next/headers";
import { orders, tableSessions } from "@/infrastructure/container";
import { getCurrentSite } from "@/interface/web/current-site";
import { getRequestOrigin } from "@/interface/web/tables/scan-url";
import { placeCustomerOrder, type PlaceOrderOutcome } from "./place-order-model";
import { readSessionId, SESSION_COOKIE, sessionCookieOptions } from "./session-cookie";

/**
 * The cart's "Place order" button. Public (guests have no account), so the only things taken from the browser are
 * the cart itself and, for takeout, the customer's name and number: restaurant from the host, the visit from the
 * HttpOnly cookie; see `placeCustomerOrder`.
 *
 * A takeout order that started a new pickup visit is remembered on this device the way a scanned table is: the
 * server sets the same cookie, so "your orders" and the ready notice follow it from the next page load on.
 */
export async function placeOrderAction(cart: unknown): Promise<PlaceOrderOutcome> {
  const site = await getCurrentSite();
  if (site.kind !== "restaurant") return { ok: false, problem: "failed" };
  const outcome = await placeCustomerOrder(
    { findSession: tableSessions.find, place: orders.place, placePickup: orders.placePickup, findPlaced: orders.findPlaced },
    { restaurant: site.restaurant, sessionId: await readSessionId(), cart },
  );
  if (outcome.ok && outcome.startedVisit) {
    const secure = (await getRequestOrigin()).startsWith("https://");
    (await cookies()).set(SESSION_COOKIE, outcome.startedVisit, sessionCookieOptions(secure));
  }
  return outcome;
}
