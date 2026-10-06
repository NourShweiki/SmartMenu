import { notFound, redirect } from "next/navigation";
import type { PublicRestaurant } from "@/application/ports/restaurant-repository";
import type { SignedInStaff } from "@/application/use-cases/sign-in-staff";
import { getStaffContext } from "@/infrastructure/container";
import { getCurrentSite } from "@/interface/web/current-site";
import type { Locale } from "@/interface/web/i18n/locales";

/**
 * Guard for every staff page and staff Server Action: the restaurant comes from the host,
 * the person and role from the session. Not signed in (or not staff here) -> login page.
 */
export async function requireStaff(locale: Locale): Promise<{ restaurant: PublicRestaurant; staff: SignedInStaff }> {
  const site = await getCurrentSite();
  if (site.kind !== "restaurant") notFound();
  const staff = await getStaffContext({ restaurantId: site.restaurant.id });
  if (!staff.ok) redirect(`/${locale}/staff/login`);
  return { restaurant: site.restaurant, staff: staff.value };
}
