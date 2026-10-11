import type { OrderStatus } from "@/domain/order/order";

/**
 * What has just happened to the orders on a guest's phone since it last looked: which became READY (the notice,
 * the sound, the notification) and which were CANCELLED (the notice to ask the staff).
 *
 * `seen` is the status each order had at the last look (null = the page has only just opened: what is there now
 * is the starting point, not news, so reloading the page does not ring again). Each change is reported once.
 */
export function orderUpdates(
  seen: ReadonlyMap<number, OrderStatus> | null,
  orders: readonly { readonly number: number; readonly status: OrderStatus }[],
): { ready: number[]; cancelled: number[]; seen: Map<number, OrderStatus> } {
  const next = new Map(seen ?? []);
  const ready: number[] = [];
  const cancelled: number[] = [];
  for (const { number, status } of orders) {
    const before = next.get(number);
    next.set(number, status);
    if (seen === null || before === status) continue;
    if (status === "READY") ready.push(number);
    if (status === "CANCELLED") cancelled.push(number);
  }
  return { ready, cancelled, seen: next };
}
