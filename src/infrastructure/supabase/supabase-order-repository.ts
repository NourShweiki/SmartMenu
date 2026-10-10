import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderRepository } from "@/application/ports/order-repository";
import type { MenuItemId } from "@/domain/menu/menu";
import type { OptionId } from "@/domain/menu/options";
import type {
  Order,
  OrderId,
  OrderItem,
  OrderItemId,
  OrderOptionSnapshot,
  OrderStatus,
  TableSessionId,
} from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Fils } from "@/domain/shared/money";
import { UUID } from "./supabase-options-repository";

type OptionRow = {
  option_id: string;
  group_name_en: string;
  group_name_ar: string;
  name_en: string;
  name_ar: string;
  price_delta_fils: number;
  position: number;
};
type ItemRow = {
  id: string;
  menu_item_id: string;
  name_en: string;
  name_ar: string;
  unit_price_fils: number;
  quantity: number;
  line_total_fils: number;
  position: number;
  order_item_options: OptionRow[];
};
export type OrderRow = {
  id: string;
  restaurant_id: string;
  session_id: string;
  number: number;
  status: string;
  subtotal_fils: number;
  service_charge_fils: number;
  tax_fils: number;
  total_fils: number;
  tax_rate_bp: number;
  service_charge_bp: number;
  created_at: string;
  status_changed_at: string;
  order_items: ItemRow[];
};

const ORDER_COLUMNS =
  "id, restaurant_id, session_id, number, status, subtotal_fils, service_charge_fils, tax_fils, total_fils, " +
  "tax_rate_bp, service_charge_bp, created_at, status_changed_at, " +
  "order_items(id, menu_item_id, name_en, name_ar, unit_price_fils, quantity, line_total_fils, position, " +
  "order_item_options(option_id, group_name_en, group_name_ar, name_en, name_ar, price_delta_fils, position))";

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
// bigint columns arrive as JSON numbers; amounts are capped far below 2^53, so a JS number is exact.
const fils = (n: number) => Number(n) as Fils;

export function toOrder(row: OrderRow): Order {
  return {
    id: row.id as OrderId,
    restaurantId: row.restaurant_id as RestaurantId,
    sessionId: row.session_id as TableSessionId,
    number: row.number,
    status: row.status as OrderStatus,
    items: [...row.order_items].sort(byPosition).map(
      (item): OrderItem => ({
        id: item.id as OrderItemId,
        menuItemId: item.menu_item_id as MenuItemId,
        name: { en: item.name_en, ar: item.name_ar },
        unitPriceFils: fils(item.unit_price_fils),
        options: [...item.order_item_options].sort(byPosition).map(
          (o): OrderOptionSnapshot => ({
            optionId: o.option_id as OptionId,
            groupName: { en: o.group_name_en, ar: o.group_name_ar },
            name: { en: o.name_en, ar: o.name_ar },
            priceDeltaFils: fils(o.price_delta_fils),
          }),
        ),
        quantity: item.quantity,
        lineTotalFils: fils(item.line_total_fils),
      }),
    ),
    subtotalFils: fils(row.subtotal_fils),
    serviceChargeFils: fils(row.service_charge_fils),
    taxFils: fils(row.tax_fils),
    totalFils: fils(row.total_fils),
    taxRateBp: row.tax_rate_bp,
    serviceChargeBp: row.service_charge_bp,
    createdAt: new Date(row.created_at),
    statusChangedAt: new Date(row.status_changed_at),
  };
}

/** The jsonb payload of public.place_order (see migration 20261010140000). Array order = receipt order. */
export function toPlaceOrderPayload(order: Order) {
  return {
    id: order.id,
    restaurant_id: order.restaurantId,
    session_id: order.sessionId,
    number: order.number,
    tax_rate_bp: order.taxRateBp,
    service_charge_bp: order.serviceChargeBp,
    subtotal_fils: order.subtotalFils,
    service_charge_fils: order.serviceChargeFils,
    tax_fils: order.taxFils,
    total_fils: order.totalFils,
    created_at: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      menu_item_id: item.menuItemId,
      name_en: item.name.en,
      name_ar: item.name.ar,
      unit_price_fils: item.unitPriceFils,
      quantity: item.quantity,
      line_total_fils: item.lineTotalFils,
      options: item.options.map((o) => ({
        option_id: o.optionId,
        group_name_en: o.groupName.en,
        group_name_ar: o.groupName.ar,
        name_en: o.name.en,
        name_ar: o.name.ar,
        price_delta_fils: o.priceDeltaFils,
      })),
    })),
  };
}

/** Postgres refusals that mean "not allowed / not a legal move" rather than "something broke". */
const REFUSED = new Set(["42501", "23514"]);

export class SupabaseOrderRepository implements OrderRepository {
  /**
   * @param db         the signed-in staff user's client (reads and status changes, RLS applies)
   * @param privileged service-role client, only needed for `nextNumber` and `place` (server-side ordering)
   */
  constructor(
    private readonly db: SupabaseClient,
    private readonly privileged?: SupabaseClient,
  ) {}

  private server(): SupabaseClient {
    if (!this.privileged) throw new Error("this operation needs the server (service-role) client");
    return this.privileged;
  }

  async nextNumber(restaurantId: RestaurantId): Promise<number> {
    const { data, error } = await this.server().rpc("next_order_number", { p_restaurant_id: restaurantId });
    if (error) throw new Error(`next_order_number failed: ${error.message}`);
    return data as number;
  }

  async place(order: Order): Promise<void> {
    const { error } = await this.server().rpc("place_order", { p_order: toPlaceOrderPayload(order) });
    if (error) throw new Error(`place_order failed: ${error.message}`);
  }

  async findById(restaurantId: RestaurantId, orderId: OrderId): Promise<Order | null> {
    if (!UUID.test(orderId)) return null;
    const { data, error } = await this.db
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw new Error(`read order failed: ${error.message}`);
    return data ? toOrder(data as unknown as OrderRow) : null;
  }

  async listOpen(restaurantId: RestaurantId): Promise<Order[]> {
    const { data, error } = await this.db
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .neq("status", "COMPLETED")
      .order("created_at", { ascending: true })
      .order("number", { ascending: true });
    if (error) throw new Error(`list open orders failed: ${error.message}`);
    return ((data ?? []) as unknown as OrderRow[]).map(toOrder);
  }

  async listBySession(restaurantId: RestaurantId, sessionId: TableSessionId): Promise<Order[]> {
    if (!UUID.test(sessionId)) return [];
    const { data, error } = await this.db
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .order("number", { ascending: true });
    if (error) throw new Error(`list session orders failed: ${error.message}`);
    return ((data ?? []) as unknown as OrderRow[]).map(toOrder);
  }

  async updateStatus(restaurantId: RestaurantId, orderId: OrderId, from: OrderStatus, to: OrderStatus): Promise<boolean> {
    if (!UUID.test(orderId)) return false;
    // `.eq("status", from)` makes the move conditional: if someone else moved it first, zero rows match.
    const { data, error } = await this.db
      .from("orders")
      .update({ status: to })
      .eq("restaurant_id", restaurantId)
      .eq("id", orderId)
      .eq("status", from)
      .select("id");
    if (error) {
      if (REFUSED.has(error.code)) return false; // the database refused this user / this move
      throw new Error(`update order status failed: ${error.message}`);
    }
    return (data?.length ?? 0) === 1;
  }
}
