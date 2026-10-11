"use server";

import { revalidatePath } from "next/cache";
import { SESSION_STATUSES, type SessionStatus, type TableSessionId } from "@/domain/table-session/table-session";
import { tableSessions } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { requireStaff } from "./require-staff";

const isStatus = (value: string): value is SessionStatus => (SESSION_STATUSES as readonly string[]).includes(value);

/**
 * "Ready to pay" and "Close table" on the open tables screen. The restaurant and the role come from requireStaff
 * (host + session), never from the form: it only says WHICH visit and WHERE to. The use case checks the role, the
 * lifecycle and that nothing unfinished is left behind when closing; the database checks role and lifecycle again.
 *
 * It returns nothing: the screen shows the tables as they are now. A move that did not happen (someone else was
 * first, an order came in meanwhile) leaves the table there in its real state, which is the answer.
 */
export async function moveVisitAction(locale: string, sessionId: string, to: string): Promise<void> {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l);
  if (isStatus(to)) {
    await tableSessions.move({ restaurantId: staff.restaurantId, role: staff.role }, { sessionId: sessionId as TableSessionId, to });
  }
  revalidatePath(`/${l}/staff/open-tables`);
}
