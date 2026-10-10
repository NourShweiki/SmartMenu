"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CustomerMenuItem, CustomerMenuSection } from "@/application/use-cases/get-public-menu";
import { cartItemCount, priceCart, type CartCatalogEntry } from "@/domain/cart/cart";
import { MAX_LINE_QUANTITY, type OrderRates } from "@/domain/order/order";
import { localized } from "@/domain/shared/localized";
import { formatPrice } from "@/interface/web/format";
import type { Locale } from "@/interface/web/i18n/locales";
import { CartPanel } from "./cart-panel";
import { OptionPicker } from "./option-picker";
import { placeOrderAction } from "./order-actions";
import type { PlaceOrderOutcome, PlaceOrderProblem } from "./place-order-model";
import { useCart } from "./use-cart";

type Props = {
  restaurantSlug: string;
  sections: CustomerMenuSection[];
  /** The restaurant's tax / service rates, for the price preview (the server prices the real order itself). */
  rates: OrderRates;
  /** Public photo URLs by item id. */
  imageUrls: Record<string, string>;
  /** The table this guest scanned (read by the server from the session cookie), or null. */
  table: { label: string } | null;
};

/** The customer menu: browse, add to a cart (with option choices), review the cart with a price preview, place the order. */
export function CustomerMenu({ restaurantSlug, sections, rates, imageUrls, table }: Props) {
  const t = useTranslations("Menu");
  const locale = useLocale() as Locale;
  const tTable = useTranslations("Table");
  const router = useRouter();
  const { cart, ready, add, setQuantity, remove, clear } = useCart(restaurantSlug);
  const [picking, setPicking] = useState<CustomerMenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [placedOrderNumber, setPlacedOrderNumber] = useState<number | null>(null);

  const catalog = useMemo(
    () =>
      new Map<string, CartCatalogEntry>(
        sections.flatMap(({ category, items }) => items.map(({ item, groups }) => [item.id as string, { item, category, groups }] as const)),
      ),
    [sections],
  );
  const priced = useMemo(() => priceCart(cart, catalog, rates), [cart, catalog, rates]);
  const count = cartItemCount(cart);

  // The short "added" confirmation disappears by itself.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /** Adds to the cart. Returns null on success, or the (translated) reason it could not be added. */
  const addToCart = (entry: CustomerMenuItem, optionIds: Parameters<typeof add>[1], quantity: number): string | null => {
    const result = add(entry.item.id, optionIds, quantity);
    if (result.ok) {
      setNotice(t("added", { name: localized(entry.item.name, locale) }));
      return null;
    }
    const { error } = result;
    return error.type === "CART_FULL"
      ? t("errors.cartFull", { max: error.max })
      : t("errors.tooMany", { max: error.type === "QUANTITY_TOO_HIGH" ? error.max : MAX_LINE_QUANTITY });
  };

  /** Sends the cart (ids and quantities only: the server takes restaurant, table and prices from its own side). */
  const placeOrder = async (): Promise<PlaceOrderProblem | null> => {
    let outcome: PlaceOrderOutcome;
    try {
      outcome = await placeOrderAction({ lines: cart.lines });
    } catch {
      outcome = { ok: false, problem: "failed" }; // no connection, or the server could not be reached
    }
    if (outcome.ok) {
      clear();
      setPlacedOrderNumber(outcome.orderNumber);
      setCartOpen(true); // the confirmation lives in the cart dialog: make sure it is seen
      return null;
    }
    router.refresh(); // the menu or the table changed under the guest: show the current state next to the reason
    return outcome.problem;
  };

  return (
    <>
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-6 pb-28">
        {table && (
          <p role="status" className="rounded-xl bg-white px-4 py-3 text-center font-semibold ring-1 ring-gray-200">
            {tTable("banner", { label: table.label })}
          </p>
        )}
        {sections.length === 0 && <p className="py-10 text-center text-gray-500">{t("empty")}</p>}

        {sections.map(({ category, items }) => (
          <section key={category.id} aria-labelledby={`cat-${category.id}`}>
            <h2 id={`cat-${category.id}`} className="mb-3 text-xl font-semibold">
              {localized(category.name, locale)}
            </h2>
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200">
              {items.map((entry) => {
                const { item } = entry;
                const name = localized(item.name, locale);
                const description = localized(item.description, locale);
                const image = imageUrls[item.id];
                return (
                  <li key={item.id} className="flex items-center gap-4 p-4">
                    {image && (
                      // Decorative: the item name is right next to it.
                      <Image src={image} alt="" width={72} height={72} unoptimized className="size-[72px] shrink-0 rounded-xl object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{name}</h3>
                      {description && <p className="text-sm text-gray-600">{description}</p>}
                      <p className="mt-1 text-sm font-semibold">
                        <bdi>{formatPrice(item.priceFils, locale)}</bdi>
                      </p>
                    </div>
                    {entry.orderable ? (
                      <button
                        type="button"
                        aria-label={`${t("add")}: ${name}`}
                        onClick={() => {
                          if (entry.groups.length > 0) {
                            setNotice(null);
                            setPicking(entry);
                          }
                          else {
                            const problem = addToCart(entry, [], 1); // success sets the "added" notice itself
                            if (problem) setNotice(problem);
                          }
                        }}
                        className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white hover:bg-gray-700"
                      >
                        {t("add")}
                      </button>
                    ) : (
                      <span className="shrink-0 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600">
                        {item.isSoldOut ? t("soldOut") : t("unavailable")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Short confirmation for screen readers and sighted users (e.g. "Kebab added"). */}
      <p role="status" aria-live="polite" className={notice ? "fixed inset-x-4 bottom-20 mx-auto max-w-md rounded-lg bg-gray-900 px-4 py-2 text-center text-sm text-white" : "sr-only"}>
        {notice}
      </p>

      {ready && count > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white p-3">
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setCartOpen(true);
            }}
            className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl bg-gray-900 px-5 py-3 font-semibold text-white hover:bg-gray-700"
          >
            <span>
              {t("cart.view")} · {t("cart.itemCount", { count })}
            </span>
            <span>
              <bdi>{formatPrice(priced.totalFils, locale)}</bdi>
            </span>
          </button>
        </div>
      )}

      <OptionPicker
        entry={picking}
        onClose={() => setPicking(null)}
        onAdd={(optionIds, quantity) => {
          const problem = picking ? addToCart(picking, optionIds, quantity) : null;
          if (!problem) setPicking(null); // added: close. Otherwise the picker shows the reason INSIDE the dialog (a toast would hide behind it)
          return problem;
        }}
      />
      <CartPanel
        open={cartOpen}
        priced={priced}
        hasTable={table !== null}
        placedOrderNumber={placedOrderNumber}
        onPlaceOrder={placeOrder}
        onClose={() => {
          setCartOpen(false);
          setPlacedOrderNumber(null);
        }}
        onSetQuantity={(key, quantity) => setQuantity(key, quantity)}
        onRemove={(key) => remove(key)}
      />
    </>
  );
}
