"use server";

import { revalidatePath } from "next/cache";
import { tables } from "@/infrastructure/container";
import type { TableId } from "@/domain/table-session/table-session";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { requireStaff } from "./require-staff";
import { readLabel, tableProblem, type TableFormState } from "./table-form-model";

async function context(locale: string) {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l); // restaurant + role from host + session, never from the form
  return { locale: l, actor: { restaurantId: staff.restaurantId, role: staff.role } };
}
const refresh = (locale: string) => revalidatePath(`/${locale}/staff/tables`, "layout");

export async function addTableAction(locale: string, _prev: TableFormState, form: FormData): Promise<TableFormState> {
  const ctx = await context(locale);
  const label = readLabel(form);
  const result = await tables.add(ctx.actor, { label });
  if (!result.ok) return { label, error: tableProblem(result.error) };
  refresh(ctx.locale);
  return { savedAt: Date.now() };
}

export async function renameTableAction(locale: string, tableId: string, _prev: TableFormState, form: FormData): Promise<TableFormState> {
  const ctx = await context(locale);
  const label = readLabel(form);
  const result = await tables.rename(ctx.actor, { tableId: tableId as TableId, label });
  if (!result.ok) return { label, error: tableProblem(result.error) };
  refresh(ctx.locale);
  return { savedAt: Date.now() };
}

// The buttons below have nothing to correct, so they return nothing: the list simply refreshes. A failure (for
// example a table someone else just deleted) shows as the unchanged list; the database refuses anything not allowed.
export async function setTableActiveAction(locale: string, tableId: string, isActive: boolean): Promise<void> {
  const ctx = await context(locale);
  await tables.setActive(ctx.actor, { tableId: tableId as TableId, isActive });
  refresh(ctx.locale);
}

/** A new QR code: the printed one stops working at once. The screen asks "are you sure?" first. */
export async function regenerateTableTokenAction(locale: string, tableId: string): Promise<void> {
  const ctx = await context(locale);
  await tables.regenerateToken(ctx.actor, { tableId: tableId as TableId });
  refresh(ctx.locale);
}

export async function deleteTableAction(locale: string, tableId: string): Promise<void> {
  const ctx = await context(locale);
  await tables.delete(ctx.actor, { tableId: tableId as TableId });
  refresh(ctx.locale);
}
