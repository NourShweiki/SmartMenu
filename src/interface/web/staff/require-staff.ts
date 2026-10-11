import { notFound, redirect } from "next/navigation";
import type { PublicRestaurant } from "@/application/ports/restaurant-repository";
import type { StaffContext } from "@/application/use-cases/get-staff-context";
import { getStaffContext } from "@/infrastructure/container";
import { getCurrentSite } from "@/interface/web/current-site";
import type { Locale } from "@/interface/web/i18n/locales";

/**
 * Guard for every staff page and staff Server Action: the restaurant comes from the host,
 * the person and role from the session. Not signed in (or not staff here) -> login page.
 *
 * Somebody who still has the temporary password they were handed is sent to the "change my password" page from
 * everywhere else (pages and actions alike), so nothing can be done with a password that somebody else knows.
 * Only that page and its action pass `allowTemporaryPassword`.
 */
export async function requireStaff(
  locale: Locale,
  options: { allowTemporaryPassword?: boolean } = {},
): Promise<{ restaurant: PublicRestaurant; staff: StaffContext }> {
  const site = await getCurrentSite();
  if (site.kind !== "restaurant") notFound();
  const staff = await getStaffContext({ restaurantId: site.restaurant.id });
  if (!staff.ok) redirect(`/${locale}/staff/login`);
  if (staff.value.mustChangePassword && !options.allowTemporaryPassword) redirect(`/${locale}/staff/password`);
  return { restaurant: site.restaurant, staff: staff.value };
}
