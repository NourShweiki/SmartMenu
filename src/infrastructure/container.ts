// Composition root: the one place that chooses which adapter implements which port.
// Adapters are created per call (lazily) so importing this file never needs env vars,
// e.g. during `next build` in CI.
import { makeGetPublicRestaurant, type GetPublicRestaurantInput } from "@/application/use-cases/get-public-restaurant";
import { makeGetStaffContext } from "@/application/use-cases/get-staff-context";
import { makeSignInStaff, type SignInStaffInput } from "@/application/use-cases/sign-in-staff";
import { makeAddMenuCategory } from "@/application/use-cases/menu/add-menu-category";
import { makeAddMenuItem } from "@/application/use-cases/menu/add-menu-item";
import { makeDeleteMenuCategory } from "@/application/use-cases/menu/delete-menu-category";
import { makeDeleteMenuItem } from "@/application/use-cases/menu/delete-menu-item";
import { makeEditMenuCategory } from "@/application/use-cases/menu/edit-menu-category";
import { makeEditMenuItem } from "@/application/use-cases/menu/edit-menu-item";
import { makeGetStaffMenu } from "@/application/use-cases/menu/get-staff-menu";
import { makeSetMenuCategoryHidden } from "@/application/use-cases/menu/set-menu-category-hidden";
import { makeSetMenuItemHidden } from "@/application/use-cases/menu/set-menu-item-hidden";
import { makeSetMenuItemSoldOut } from "@/application/use-cases/menu/set-menu-item-sold-out";
import type { MenuActor } from "@/application/use-cases/menu/shared";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { createPublicClient, createSessionClient } from "./supabase/client";
import { SupabaseAuthGateway } from "./supabase/supabase-auth-gateway";
import { SupabaseMembershipRepository } from "./supabase/supabase-membership-repository";
import { SupabaseMenuRepository } from "./supabase/supabase-menu-repository";
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

// ─── Menu (staff) ───────────────────────────────────────────────────────

const systemClock = { now: () => new Date() };
const uuidIds = { newId: () => crypto.randomUUID() };

/** Menu use cases run as the signed-in staff user, so RLS applies to every query. */
async function menuDeps() {
  return { menu: new SupabaseMenuRepository(await createSessionClient()), ids: uuidIds, clock: systemClock };
}

export const menu = {
  getStaffMenu: async (actor: MenuActor) => makeGetStaffMenu(await menuDeps())(actor),
  addCategory: async (...args: Parameters<ReturnType<typeof makeAddMenuCategory>>) =>
    makeAddMenuCategory(await menuDeps())(...args),
  addItem: async (...args: Parameters<ReturnType<typeof makeAddMenuItem>>) => makeAddMenuItem(await menuDeps())(...args),
  editItem: async (...args: Parameters<ReturnType<typeof makeEditMenuItem>>) => makeEditMenuItem(await menuDeps())(...args),
  setItemHidden: async (...args: Parameters<ReturnType<typeof makeSetMenuItemHidden>>) =>
    makeSetMenuItemHidden(await menuDeps())(...args),
  setItemSoldOut: async (...args: Parameters<ReturnType<typeof makeSetMenuItemSoldOut>>) =>
    makeSetMenuItemSoldOut(await menuDeps())(...args),
  deleteItem: async (...args: Parameters<ReturnType<typeof makeDeleteMenuItem>>) =>
    makeDeleteMenuItem(await menuDeps())(...args),
  editCategory: async (...args: Parameters<ReturnType<typeof makeEditMenuCategory>>) =>
    makeEditMenuCategory(await menuDeps())(...args),
  setCategoryHidden: async (...args: Parameters<ReturnType<typeof makeSetMenuCategoryHidden>>) =>
    makeSetMenuCategoryHidden(await menuDeps())(...args),
  deleteCategory: async (...args: Parameters<ReturnType<typeof makeDeleteMenuCategory>>) =>
    makeDeleteMenuCategory(await menuDeps())(...args),
};
