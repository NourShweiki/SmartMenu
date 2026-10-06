"use server";

import { revalidatePath } from "next/cache";
import type { CategoryId, MenuItemId } from "@/domain/menu/menu";
import type { Direction } from "@/domain/shared/ordering";
import { menu } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { requireStaff } from "./require-staff";

// Quick toggles on the staff menu screen. The restaurant + role come from requireStaff (host
// + session); the form only says WHICH item. Use cases re-check permissions and tenant.

async function actor(locale: string) {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l);
  return { locale: l, actor: { restaurantId: staff.restaurantId, role: staff.role } };
}

export async function setSoldOutAction(locale: string, itemId: string, isSoldOut: boolean): Promise<void> {
  const ctx = await actor(locale);
  await menu.setItemSoldOut(ctx.actor, { itemId: itemId as MenuItemId, isSoldOut });
  revalidatePath(`/${ctx.locale}/staff/menu`);
}

export async function setHiddenAction(locale: string, itemId: string, isHidden: boolean): Promise<void> {
  const ctx = await actor(locale);
  await menu.setItemHidden(ctx.actor, { itemId: itemId as MenuItemId, isHidden });
  revalidatePath(`/${ctx.locale}/staff/menu`);
}

const direction = (d: string): Direction => (d === "up" ? "up" : "down");

export async function moveCategoryAction(locale: string, categoryId: string, dir: string): Promise<void> {
  const ctx = await actor(locale);
  await menu.moveCategory(ctx.actor, { categoryId: categoryId as CategoryId, direction: direction(dir) });
  revalidatePath(`/${ctx.locale}/staff/menu`);
}

export async function moveItemAction(locale: string, itemId: string, dir: string): Promise<void> {
  const ctx = await actor(locale);
  await menu.moveItem(ctx.actor, { itemId: itemId as MenuItemId, direction: direction(dir) });
  revalidatePath(`/${ctx.locale}/staff/menu`);
}
