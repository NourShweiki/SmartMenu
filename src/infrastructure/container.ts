// Composition root: the one place that chooses which adapter implements which port.
// Adapters are created per call (lazily) so importing this file never needs env vars,
// e.g. during `next build` in CI.
import { makeGetPublicRestaurant, type GetPublicRestaurantInput } from "@/application/use-cases/get-public-restaurant";
import { makeGetStaffContext } from "@/application/use-cases/get-staff-context";
import { makeSignInStaff, type SignInStaffInput } from "@/application/use-cases/sign-in-staff";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { createPublicClient, createSessionClient } from "./supabase/client";
import { SupabaseAuthGateway } from "./supabase/supabase-auth-gateway";
import { SupabaseMembershipRepository } from "./supabase/supabase-membership-repository";
import { SupabaseRestaurantRepository } from "./supabase/supabase-restaurant-repository";

export { refreshSessionCookies } from "./supabase/client";

/** Base domain restaurants live under (<slug>.<root>). Local default: localhost. */
export function appRootDomain(): string {
  return process.env.APP_ROOT_DOMAIN || "localhost";
}

export function getPublicRestaurant(input: GetPublicRestaurantInput) {
  const restaurants = new SupabaseRestaurantRepository(createPublicClient());
  return makeGetPublicRestaurant({ restaurants })(input);
}

/** Auth + membership adapters sharing the signed-in user's cookie session. */
async function staffDeps() {
  const db = await createSessionClient();
  return { auth: new SupabaseAuthGateway(db), memberships: new SupabaseMembershipRepository(db) };
}

export async function signInStaff(input: SignInStaffInput) {
  return makeSignInStaff(await staffDeps())(input);
}

export async function getStaffContext(input: { restaurantId: RestaurantId }) {
  return makeGetStaffContext(await staffDeps())(input);
}

export async function signOutStaff() {
  return (await staffDeps()).auth.signOut();
}
