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
import { makeMoveMenuCategory } from "@/application/use-cases/menu/move-menu-category";
import { makeMoveMenuItem } from "@/application/use-cases/menu/move-menu-item";
import { makeSetMenuCategoryHidden } from "@/application/use-cases/menu/set-menu-category-hidden";
import { makeSetMenuItemHidden } from "@/application/use-cases/menu/set-menu-item-hidden";
import { makeRemoveMenuItemPhoto, makeSetMenuItemPhoto } from "@/application/use-cases/menu/set-menu-item-photo";
import { makeSetMenuItemSoldOut } from "@/application/use-cases/menu/set-menu-item-sold-out";
import { makeAddOption } from "@/application/use-cases/menu/options/add-option";
import { makeAddOptionGroup } from "@/application/use-cases/menu/options/add-option-group";
import { makeDeleteOption } from "@/application/use-cases/menu/options/delete-option";
import { makeDeleteOptionGroup } from "@/application/use-cases/menu/options/delete-option-group";
import { makeEditOption } from "@/application/use-cases/menu/options/edit-option";
import { makeEditOptionGroup } from "@/application/use-cases/menu/options/edit-option-group";
import { makeGetOptionGroups } from "@/application/use-cases/menu/options/get-option-groups";
import { makeMoveOption } from "@/application/use-cases/menu/options/move-option";
import { makeSetItemOptionGroups } from "@/application/use-cases/menu/options/set-item-option-groups";
import type { MenuActor } from "@/application/use-cases/menu/shared";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { createPublicClient, createSessionClient } from "./supabase/client";
import { SupabaseAuthGateway } from "./supabase/supabase-auth-gateway";
import { SupabaseMembershipRepository } from "./supabase/supabase-membership-repository";
import { SupabaseMenuRepository } from "./supabase/supabase-menu-repository";
import { SupabaseOptionsRepository } from "./supabase/supabase-options-repository";
import { SupabasePhotoStorage } from "./supabase/supabase-photo-storage";
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
  const db = await createSessionClient();
  return {
    menu: new SupabaseMenuRepository(db),
    options: new SupabaseOptionsRepository(db),
    photos: new SupabasePhotoStorage(db),
    ids: uuidIds,
    clock: systemClock,
  };
}

/** Public URL of a menu photo (no session needed: the bucket is view-only public). */
export function menuPhotoUrl(path: string): string {
  return new SupabasePhotoStorage(createPublicClient()).publicUrl(path);
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
  setItemPhoto: async (...args: Parameters<ReturnType<typeof makeSetMenuItemPhoto>>) =>
    makeSetMenuItemPhoto(await menuDeps())(...args),
  removeItemPhoto: async (...args: Parameters<ReturnType<typeof makeRemoveMenuItemPhoto>>) =>
    makeRemoveMenuItemPhoto(await menuDeps())(...args),
  moveCategory: async (...args: Parameters<ReturnType<typeof makeMoveMenuCategory>>) =>
    makeMoveMenuCategory(await menuDeps())(...args),
  moveItem: async (...args: Parameters<ReturnType<typeof makeMoveMenuItem>>) => makeMoveMenuItem(await menuDeps())(...args),
};

// ─── Option groups (staff) ──────────────────────────────────────────────

export const options = {
  getGroups: async (actor: MenuActor) => makeGetOptionGroups(await menuDeps())(actor),
  addGroup: async (...args: Parameters<ReturnType<typeof makeAddOptionGroup>>) => makeAddOptionGroup(await menuDeps())(...args),
  editGroup: async (...args: Parameters<ReturnType<typeof makeEditOptionGroup>>) =>
    makeEditOptionGroup(await menuDeps())(...args),
  deleteGroup: async (...args: Parameters<ReturnType<typeof makeDeleteOptionGroup>>) =>
    makeDeleteOptionGroup(await menuDeps())(...args),
  addOption: async (...args: Parameters<ReturnType<typeof makeAddOption>>) => makeAddOption(await menuDeps())(...args),
  editOption: async (...args: Parameters<ReturnType<typeof makeEditOption>>) => makeEditOption(await menuDeps())(...args),
  deleteOption: async (...args: Parameters<ReturnType<typeof makeDeleteOption>>) => makeDeleteOption(await menuDeps())(...args),
  setItemGroups: async (...args: Parameters<ReturnType<typeof makeSetItemOptionGroups>>) =>
    makeSetItemOptionGroups(await menuDeps())(...args),
  moveOption: async (...args: Parameters<ReturnType<typeof makeMoveOption>>) => makeMoveOption(await menuDeps())(...args),
};
