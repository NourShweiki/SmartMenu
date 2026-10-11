import type { BrandingRepository } from "@/application/ports/branding-repository";
import type { MenuRepository } from "@/application/ports/menu-repository";
import type { OrderHistory } from "@/application/ports/order-repository";
import type { StaffRepository } from "@/application/ports/staff-repository";
import type { TableRepository } from "@/application/ports/table-repository";
import { isOrderable } from "@/domain/menu/menu";
import { buildSetupChecklist, type SetupChecklist } from "@/domain/restaurant/setup-checklist";
import { isScannable } from "@/domain/table-session/table-session";
import type { Result } from "@/domain/shared/result";
import { ok } from "@/domain/shared/result";
import { requirePermission, type ForbiddenError, type StaffActor } from "../permissions";

/**
 * The owner's setup checklist: reads what the restaurant has (as the signed-in owner, so the database decides again)
 * and lets the domain rule say what is still missing. Only for whoever may change the restaurant's settings (the
 * OWNER): it is their to-do list. `dineInEnabled` comes from the restaurant's settings as the server read them.
 */
export function makeGetSetupChecklist(deps: {
  menu: Pick<MenuRepository, "listCategories" | "listItems">;
  tables: Pick<TableRepository, "list">;
  branding: Pick<BrandingRepository, "find">;
  staff: Pick<StaffRepository, "list">;
  orders: OrderHistory;
}) {
  return async (actor: StaffActor, settings: { dineInEnabled: boolean }): Promise<Result<SetupChecklist, ForbiddenError>> => {
    const allowed = requirePermission(actor, "restaurant:settings");
    if (!allowed.ok) return allowed;

    const id = actor.restaurantId;
    const [categories, items, tables, record, members, hasOrders] = await Promise.all([
      deps.menu.listCategories(id),
      deps.menu.listItems(id),
      settings.dineInEnabled ? deps.tables.list(id) : [], // not asked where there are no tables to set up
      deps.branding.find(id),
      deps.staff.list(id),
      deps.orders.hasAny(id),
    ]);
    const categoryOf = new Map(categories.map((category) => [category.id as string, category]));
    const branding = record?.branding;
    const written = branding ? [branding.tagline, branding.about, branding.address, branding.openingHours].some((text) => text.en.trim() !== "" || text.ar.trim() !== "") : false;

    return ok(
      buildSetupChecklist(
        {
          orderableItems: items.filter((item) => {
            const category = categoryOf.get(item.categoryId);
            return category !== undefined && isOrderable(item, category);
          }).length,
          activeTables: tables.filter(isScannable).length,
          hasLogo: Boolean(branding?.logoPath),
          hasDetails: written || Boolean(branding?.phone.trim()),
          staffBesidesOwners: members.filter((member) => member.role !== "OWNER").length,
          hasOrders,
        },
        settings,
      ),
    );
  };
}
