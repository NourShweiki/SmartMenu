// Composition root: the one place that chooses which adapter implements which port.
// Adapters are created per call (lazily) so importing this file never needs env vars,
// e.g. during `next build` in CI.
import { makeGetPublicRestaurant, type GetPublicRestaurantInput } from "@/application/use-cases/get-public-restaurant";
import { makeGetPublicMenu } from "@/application/use-cases/get-public-menu";
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
import { makeGetBranding } from "@/application/use-cases/branding/get-branding";
import { makeRemoveRestaurantLogo, makeSetRestaurantLogo } from "@/application/use-cases/branding/set-restaurant-logo";
import { makeUpdateBranding } from "@/application/use-cases/branding/update-branding";
import type { BrandingActor } from "@/application/use-cases/branding/shared";
import { makeGetStaffOrders } from "@/application/use-cases/orders/get-staff-orders";
import { makeMoveOrderStatus } from "@/application/use-cases/orders/move-order-status";
import { makePlaceOrder } from "@/application/use-cases/orders/place-order";
import type { StaffActor } from "@/application/use-cases/permissions";
import { makeGetRestaurantSettings } from "@/application/use-cases/settings/get-restaurant-settings";
import { makeUpdateRestaurantSettings } from "@/application/use-cases/settings/update-restaurant-settings";
import type { SettingsActor } from "@/application/use-cases/settings/shared";
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
import { createPublicClient, createServiceClient, createSessionClient } from "./supabase/client";
import { SupabaseBrandingRepository } from "./supabase/supabase-branding-repository";
import { SupabaseOrderRepository } from "./supabase/supabase-order-repository";
import { SupabaseOrderingCatalog } from "./supabase/supabase-ordering-catalog";
import { SupabaseAuthGateway } from "./supabase/supabase-auth-gateway";
import { SupabaseMembershipRepository } from "./supabase/supabase-membership-repository";
import { SupabaseMenuRepository } from "./supabase/supabase-menu-repository";
import { SupabaseOptionsRepository } from "./supabase/supabase-options-repository";
import { LOGOS_BUCKET, SupabasePhotoStorage } from "./supabase/supabase-photo-storage";
import { SupabasePublicMenuRepository } from "./supabase/supabase-public-menu-repository";
import { SupabaseRestaurantRepository } from "./supabase/supabase-restaurant-repository";
import { SupabaseSettingsRepository } from "./supabase/supabase-settings-repository";

export { refreshSessionCookies } from "./supabase/client";

/** Base domain restaurants live under (<slug>.<root>). Local default: localhost. */
export function appRootDomain(): string {
  return process.env.APP_ROOT_DOMAIN || "localhost";
}

export function getPublicRestaurant(input: GetPublicRestaurantInput) {
  const restaurants = new SupabaseRestaurantRepository(createPublicClient());
  return makeGetPublicRestaurant({ restaurants })(input);
}

/** The public menu (what a customer sees), read through the narrow public database function: no login, no table access. */
export function getPublicMenu(restaurant: { id: RestaurantId; slug: string }) {
  return makeGetPublicMenu({ menu: new SupabasePublicMenuRepository(createPublicClient()) })(restaurant);
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

/** Same, for a whole page of photos: ONE storage client instead of one per photo. */
export function menuPhotoUrls(paths: readonly string[]): string[] {
  const photos = new SupabasePhotoStorage(createPublicClient());
  return paths.map((path) => photos.publicUrl(path));
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

// ─── Restaurant settings (owner) ────────────────────────────────────────

/** Runs as the signed-in user, so RLS decides again: members read, only the OWNER updates. */
async function settingsDeps() {
  return { settings: new SupabaseSettingsRepository(await createSessionClient()) };
}

export const settings = {
  get: async (actor: SettingsActor) => makeGetRestaurantSettings(await settingsDeps())(actor),
  update: async (...args: Parameters<ReturnType<typeof makeUpdateRestaurantSettings>>) =>
    makeUpdateRestaurantSettings(await settingsDeps())(...args),
};

// ─── Orders ─────────────────────────────────────────────────────────────

/** Staff reads and status changes run as the signed-in user (RLS applies). */
async function staffOrderDeps() {
  return { orders: new SupabaseOrderRepository(await createSessionClient()), clock: systemClock };
}

export const orders = {
  /**
   * Places a customer's order. Customers have no account, so this runs server-side with the service-role
   * client; the restaurantId MUST come from the host and the rates from the restaurant's settings.
   */
  place: (...args: Parameters<ReturnType<typeof makePlaceOrder>>) => {
    const service = createServiceClient();
    return makePlaceOrder({
      orders: new SupabaseOrderRepository(service, service),
      catalog: new SupabaseOrderingCatalog(service),
      ids: uuidIds,
      clock: systemClock,
    })(...args);
  },
  moveStatus: async (...args: Parameters<ReturnType<typeof makeMoveOrderStatus>>) =>
    makeMoveOrderStatus(await staffOrderDeps())(...args),
  getForStaff: async (actor: StaffActor, query?: Parameters<ReturnType<typeof makeGetStaffOrders>>[1]) =>
    makeGetStaffOrders(await staffOrderDeps())(actor, query),
};

// ─── Branding (owner) ───────────────────────────────────────────────────

/** Runs as the signed-in user, so RLS decides again: only the OWNER saves; the logo bucket is OWNER-only too. */
async function brandingDeps() {
  const db = await createSessionClient();
  return { branding: new SupabaseBrandingRepository(db), logos: new SupabasePhotoStorage(db, LOGOS_BUCKET), ids: uuidIds };
}

/** Public URL of a restaurant logo (no session needed: the bucket is view-only public). */
export function logoUrl(path: string): string {
  return new SupabasePhotoStorage(createPublicClient(), LOGOS_BUCKET).publicUrl(path);
}

export const branding = {
  get: async (actor: BrandingActor) => makeGetBranding(await brandingDeps())(actor),
  update: async (...args: Parameters<ReturnType<typeof makeUpdateBranding>>) => makeUpdateBranding(await brandingDeps())(...args),
  setLogo: async (...args: Parameters<ReturnType<typeof makeSetRestaurantLogo>>) =>
    makeSetRestaurantLogo(await brandingDeps())(...args),
  removeLogo: async (...args: Parameters<ReturnType<typeof makeRemoveRestaurantLogo>>) =>
    makeRemoveRestaurantLogo(await brandingDeps())(...args),
};
