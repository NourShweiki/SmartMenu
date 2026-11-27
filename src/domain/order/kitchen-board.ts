import { can, type Role } from "@/domain/restaurant/role";
import type { SessionKind } from "@/domain/table-session/pickup";
import { nextStatus, permissionsToMoveTo, type Order, type OrderStatus } from "./order";

/**
 * The kitchen screen's rules (PROJECT_SPEC.md §3.3, decided by Nour 2026-11-27): which column an order sits in,
 * which tap it offers, which status steps that tap takes for this person, and the timer with its fixed colours.
 * The status flow itself does not change: a tap only bundles steps of `ORDER_FLOW`, each one still checked by the
 * use case and the database.
 */

/** The board's columns, in the order they are shown. */
export const KITCHEN_COLUMNS = ["new", "making", "ready"] as const;
export type KitchenColumn = (typeof KITCHEN_COLUMNS)[number];

/** The one button a ticket has. */
export type KitchenTap = "start" | "ready" | "pickedUp";

/** Timer colours, FIXED for now (not a setting, Nour 2026-11-27): amber from 3 minutes, red from 6. */
export const KITCHEN_AMBER_AFTER_MINUTES = 3;
export const KITCHEN_RED_AFTER_MINUTES = 6;
export type TimerLevel = "green" | "amber" | "red";

/** A tap is sent only after this many seconds, while the ticket offers "Undo" (an order never goes back a step). */
export const KITCHEN_UNDO_SECONDS = 5;

/**
 * Where an order sits on the board, or null when it is not kitchen work.
 * - NEW and CONFIRMED: "new" (accepted maybe, but nobody started making it).
 * - PREPARING: "making".
 * - READY: "ready". A takeout order that was handed over (SERVED) but not completed stays there too, so "Picked up"
 *   can still complete it. A SERVED table order is the cashier's (payment at the open tables), not the kitchen's.
 * - COMPLETED, CANCELLED: not on the board.
 */
export function kitchenColumn(status: OrderStatus, kind: SessionKind): KitchenColumn | null {
  switch (status) {
    case "NEW":
    case "CONFIRMED":
      return "new";
    case "PREPARING":
      return "making";
    case "READY":
      return "ready";
    case "SERVED":
      return kind === "PICKUP" ? "ready" : null;
    default:
      return null;
  }
}

/** The status each tap leads to. "Picked up" completes a takeout order; at a table it means served (paid later). */
function tapTarget(tap: KitchenTap, kind: SessionKind): OrderStatus {
  if (tap === "start") return "PREPARING";
  if (tap === "ready") return "READY";
  return kind === "PICKUP" ? "COMPLETED" : "SERVED";
}

const TAP_OF_COLUMN: Record<KitchenColumn, KitchenTap> = { new: "start", making: "ready", ready: "pickedUp" };

/** The steps from `from` (exclusive) up to `to` (inclusive) along the flow. Empty when `to` is not ahead. */
function stepsBetween(from: OrderStatus, to: OrderStatus): OrderStatus[] {
  const steps: OrderStatus[] = [];
  for (let at = nextStatus(from); at !== null; at = nextStatus(at)) {
    steps.push(at);
    if (at === to) return steps;
  }
  return [];
}

export type KitchenAction = {
  readonly tap: KitchenTap;
  /** The statuses to move to, one after another, in this order. Never empty. */
  readonly steps: readonly OrderStatus[];
};

/**
 * What the ticket's button does FOR THIS PERSON, or null when they have no button on it. The tap takes the steps up
 * to its target that this role may take, stopping at the first one it may not (so a waiter's "Picked up" on a takeout
 * order hands it over but leaves completing to the cashier). Owner and manager may take every step, the cashier every
 * step of a takeout order (spec §4), so at a coffee shop's counter each tap does its whole job.
 */
export function kitchenAction(status: OrderStatus, kind: SessionKind, role: Role): KitchenAction | null {
  const column = kitchenColumn(status, kind);
  if (!column) return null;
  const tap = TAP_OF_COLUMN[column];
  const allowed: OrderStatus[] = [];
  for (const step of stepsBetween(status, tapTarget(tap, kind))) {
    if (!permissionsToMoveTo(step, kind).some((permission) => can(role, permission))) break;
    allowed.push(step);
  }
  return allowed.length > 0 ? { tap, steps: allowed } : null;
}

/** Whole seconds from `from` to `now`; never negative (a clock a little behind must not show "-0:01"). */
export function secondsSince(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
}

/** The timer's colour for an order placed `seconds` ago. */
export function timerLevel(seconds: number): TimerLevel {
  if (seconds >= KITCHEN_RED_AFTER_MINUTES * 60) return "red";
  if (seconds >= KITCHEN_AMBER_AFTER_MINUTES * 60) return "amber";
  return "green";
}

/**
 * The ticket's timer. While the order is being waited for it counts from the moment it was PLACED and has a colour;
 * once it is ready it shows how long it has waited for pickup instead (since its status last changed), without a
 * colour.
 */
export type KitchenTimer =
  | { readonly kind: "sincePlaced"; readonly seconds: number; readonly level: TimerLevel }
  | { readonly kind: "waitingForPickup"; readonly seconds: number };

export function kitchenTimer(
  order: Pick<Order, "status" | "createdAt" | "statusChangedAt">,
  kind: SessionKind,
  now: Date,
): KitchenTimer {
  if (kitchenColumn(order.status, kind) === "ready") return { kind: "waitingForPickup", seconds: secondsSince(order.statusChangedAt, now) };
  const seconds = secondsSince(order.createdAt, now);
  return { kind: "sincePlaced", seconds, level: timerLevel(seconds) };
}
