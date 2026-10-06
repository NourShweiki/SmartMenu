// Composition root: the one place that chooses which adapter implements which port.
// Adapters are created per call (lazily) so importing this file never needs env vars,
// e.g. during `next build` in CI.
import { makeGetPublicRestaurant, type GetPublicRestaurantInput } from "@/application/use-cases/get-public-restaurant";
import { createPublicClient } from "./supabase/client";
import { SupabaseRestaurantRepository } from "./supabase/supabase-restaurant-repository";

/** Base domain restaurants live under (<slug>.<root>). Local default: localhost. */
export function appRootDomain(): string {
  return process.env.APP_ROOT_DOMAIN || "localhost";
}

export function getPublicRestaurant(input: GetPublicRestaurantInput) {
  const restaurants = new SupabaseRestaurantRepository(createPublicClient());
  return makeGetPublicRestaurant({ restaurants })(input);
}
