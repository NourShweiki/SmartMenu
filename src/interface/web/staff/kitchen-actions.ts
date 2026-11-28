"use server";

import { revalidatePath } from "next/cache";
import type { KitchenTap } from "@/domain/order/kitchen-board";
import type { OrderId } from "@/domain/order/order";
import { orders } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { requireStaff } from "./require-staff";

const TAPS: readonly string[] = ["start", "ready", "pickedUp"] satisfies KitchenTap[];
const isTap = (value: string): value is KitchenTap => TAPS.includes(value);

/**
 * A button on a kitchen-screen ticket (Start / Ready / Picked up). The restaurant and the role come from requireStaff
 * (host + session), never from the screen: it only says WHICH order and WHICH button. The use case works out what that
 * button means for the order as it is now and takes the steps one by one; the database checks each step again.
 *
 * It returns nothing, like the Orders screen's buttons: the board simply shows the orders as they are now. A tap that
 * could not happen (someone else moved the order first, an out-of-date screen) leaves the order in its real state.
 * The customer's phone notices READY by itself (it follows its own orders), as with the Orders screen.
 */
export async function kitchenTapAction(locale: string, orderId: string, tap: string): Promise<void> {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l);
  if (isTap(tap)) {
    await orders.kitchenTap({ restaurantId: staff.restaurantId, role: staff.role }, { orderId: orderId as OrderId, tap });
  }
  revalidatePath(`/${l}/staff/kitchen`);
}

/** "Cancel order" on a ticket, with its reason: the same use case and rules as on the Orders screen. */
export async function kitchenCancelAction(locale: string, orderId: string, form: FormData): Promise<void> {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l);
  const reason = form.get("reason");
  if (typeof reason === "string") {
    await orders.cancel({ restaurantId: staff.restaurantId, role: staff.role }, { orderId: orderId as OrderId, reason });
  }
  revalidatePath(`/${l}/staff/kitchen`);
}
