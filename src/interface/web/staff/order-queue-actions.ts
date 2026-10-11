"use server";

import { revalidatePath } from "next/cache";
import { ORDER_FLOW, type OrderId, type OrderStatus } from "@/domain/order/order";
import { orders } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { requireStaff } from "./require-staff";

const isStatus = (value: string): value is OrderStatus => (ORDER_FLOW as readonly string[]).includes(value);

/**
 * A status button on the staff order screen. The restaurant and the role come from requireStaff (host + session),
 * never from the form: it only says WHICH order and WHERE to. The use case checks the role and the one-step rule,
 * and the database checks both again.
 *
 * It returns nothing: the screen simply shows the list as it is now. If the move did not happen (someone else was
 * first, or it is not this role's step) the order appears in its real state, which is the answer.
 */
export async function moveOrderAction(locale: string, orderId: string, to: string): Promise<void> {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l);
  if (isStatus(to)) {
    await orders.moveStatus({ restaurantId: staff.restaurantId, role: staff.role }, { orderId: orderId as OrderId, to });
  }
  revalidatePath(`/${l}/staff/orders`);
}
