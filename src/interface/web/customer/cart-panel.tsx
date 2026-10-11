"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import type { PricedCart, PricedLine } from "@/domain/cart/cart";
import { MAX_LINE_QUANTITY } from "@/domain/order/order";
import { localized } from "@/domain/shared/localized";
import { formatPrice } from "@/interface/web/format";
import type { Locale } from "@/interface/web/i18n/locales";
import type { PlaceOrderProblem } from "./place-order-model";

/**
 * Which way this phone orders: for the table it scanned; takeout as a new pickup order (name and number are asked);
 * takeout into the pickup order it already has open; or not at all (no table scanned and no takeout here).
 */
export type OrderingMode = "table" | "pickup" | "pickupOpen" | "none";

type Customer = { name: string; phone: string };

/** The name and number a takeout customer typed last time on this device, so they need not type them again. */
const customerStore = (key: string) => {
  const name = `smartmenu.pickup.${key}`;
  return {
    read(): Customer {
      try {
        const saved = JSON.parse(window.localStorage.getItem(name) ?? "null") as Partial<Customer> | null;
        return { name: typeof saved?.name === "string" ? saved.name : "", phone: typeof saved?.phone === "string" ? saved.phone : "" };
      } catch {
        return { name: "", phone: "" };
      }
    },
    write(customer: Customer) {
      try {
        window.localStorage.setItem(name, JSON.stringify(customer));
      } catch {
        // No storage in this browser: the customer types them again next time.
      }
    },
  };
};

type Props = {
  open: boolean;
  priced: PricedCart;
  ordering: OrderingMode;
  /** The name the open pickup order is under (for "pickupOpen"), or null. */
  pickupName: string | null;
  /** The restaurant also takes orders at its tables: the takeout form then says how to order to a table instead. */
  tableHint: boolean;
  /** Names this restaurant's entry in the device's storage (the customer's name and number are remembered per restaurant). */
  storageKey: string;
  /** The number of the order just placed: the panel shows the confirmation instead of the (now empty) cart. */
  placedOrderNumber: number | null;
  /** Sends the cart (with the customer for a new pickup order). Resolves to null when the order was placed, or the reason it was not. */
  onPlaceOrder: (customer?: Customer) => Promise<PlaceOrderProblem | null>;
  onClose: () => void;
  onSetQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
};

/** The cart as a modal sheet: lines, quantities, the price preview, placing the order and its confirmation. */
export function CartPanel({ open, priced, ordering, pickupName, tableHint, storageKey, placedOrderNumber, onPlaceOrder, onClose, onSetQuantity, onRemove }: Props) {
  const t = useTranslations("Menu");
  const locale = useLocale() as Locale;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<PlaceOrderProblem | null>(null);
  const [customer, setCustomer] = useState<Customer>({ name: "", phone: "" });
  // What the confirmation says depends on how THIS order was placed, not on what the page has become since.
  const [placedAs, setPlacedAs] = useState<OrderingMode>(ordering);

  // After the page is in the browser (storage is not there on the server): what was typed last time.
  useEffect(() => {
    if (ordering === "pickup") setCustomer(customerStore(storageKey).read());
  }, [ordering, storageKey]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) setProblem(null); // a reason shown earlier is stale the next time the cart is opened
  }, [open]);

  // Why the button is off (nothing to do with the server): no table scanned, or a line that must be removed first.
  const blocked = ordering === "none" ? t("cart.checkoutSoon") : priced.lines.length > 0 && !priced.canCheckout ? t("cart.fixFirst") : null;
  // Refusals that belong to one of the two takeout fields are shown next to it.
  const nameProblem = problem === "nameRequired" || problem === "nameInvalid" ? problem : null;
  const phoneProblem = problem === "phoneInvalid" ? problem : null;

  // While the order is on its way the cart is frozen: no edits (they would be lost when the cart is cleared) and no
  // closing (the confirmation or the reason must be seen).
  const placeOrder = async () => {
    setPending(true);
    setProblem(null);
    setPlacedAs(ordering);
    try {
      if (ordering === "pickup") customerStore(storageKey).write(customer);
      setProblem(await onPlaceOrder(ordering === "pickup" ? customer : undefined));
    } finally {
      setPending(false);
    }
  };

  /** A change to the cart: the reason of an earlier refusal no longer describes it. */
  const edit = (change: () => void) => {
    setProblem(null);
    change();
  };

  const row = (label: string, value: string, strong = false) => (
    <div className={`flex items-center justify-between gap-4 ${strong ? "text-lg font-semibold" : "text-sm text-gray-600"}`}>
      <dt>{label}</dt>
      <dd>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );

  const line = (l: PricedLine) => (
    <li key={l.key} className="flex flex-col gap-2 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{l.item ? localized(l.item.name, locale) : t("cart.unknownItem")}</p>
          {l.options.length > 0 && (
            <p className="text-sm text-gray-600">{l.options.map((o) => localized(o.name, locale)).join(" · ")}</p>
          )}
        </div>
        {l.problem === null && (
          <p className="shrink-0 font-semibold">
            <bdi>{formatPrice(l.lineTotalFils, locale)}</bdi>
          </p>
        )}
      </div>
      {l.problem && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`cart.problems.${l.problem}`)}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        {l.problem === null ? (
          <div className="flex items-center gap-2" role="group" aria-label={t("quantity")}>
            <button
              type="button"
              onClick={() => edit(() => onSetQuantity(l.key, l.quantity - 1))}
              disabled={pending}
              aria-label={`${t("decrease")}: ${l.item ? localized(l.item.name, locale) : ""}`}
              className="size-8 rounded-lg border border-gray-300 disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-6 text-center font-semibold" aria-live="polite">
              {l.quantity}
            </span>
            <button
              type="button"
              onClick={() => edit(() => onSetQuantity(l.key, l.quantity + 1))}
              disabled={pending || l.quantity >= MAX_LINE_QUANTITY}
              aria-label={`${t("increase")}: ${l.item ? localized(l.item.name, locale) : ""}`}
              className="size-8 rounded-lg border border-gray-300 disabled:opacity-40"
            >
              +
            </button>
          </div>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => edit(() => onRemove(l.key))} disabled={pending} className="text-sm text-gray-600 underline hover:text-gray-900 disabled:opacity-40">
          {t("cart.remove")}
        </button>
      </div>
    </li>
  );

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault(); // Escape / the back gesture
      }}
      aria-labelledby={titleId}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl p-0 shadow-xl backdrop:bg-black/50"
    >
      {placedOrderNumber !== null ? (
        <div className="flex flex-col items-center gap-4 p-6 text-center" role="status">
          <h2 id={titleId} className="text-xl font-semibold">
            {t("order.title")}
          </h2>
          <p className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">{t("order.numberLabel")}</span>
            <bdi className="text-4xl font-semibold">{placedOrderNumber}</bdi>
          </p>
          <p className="text-gray-600">{placedAs === "table" ? t("order.body") : t("order.pickupBody")}</p>
          <button type="button" onClick={onClose} className="w-full rounded-lg bg-gray-900 px-4 py-2.5 font-semibold text-white hover:bg-gray-700">
            {t("order.done")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-5">
          <header className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-xl font-semibold">
              {t("cart.title")}
            </h2>
            <button type="button" onClick={onClose} disabled={pending} aria-label={t("close")} className="rounded-lg px-2 py-1 text-xl leading-none text-gray-500 hover:bg-gray-100 disabled:opacity-40">
              ×
            </button>
          </header>

          {priced.lines.length === 0 ? (
            <p className="py-6 text-center text-gray-500">{t("cart.empty")}</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-100">{priced.lines.map(line)}</ul>
              <dl className="flex flex-col gap-1 border-t border-gray-200 pt-3">
                {row(t("cart.subtotal"), formatPrice(priced.subtotalFils, locale))}
                {priced.serviceChargeFils > 0 && row(t("cart.service"), formatPrice(priced.serviceChargeFils, locale))}
                {priced.taxFils > 0 && row(t("cart.tax"), formatPrice(priced.taxFils, locale))}
                {row(t("cart.total"), formatPrice(priced.totalFils, locale), true)}
              </dl>
              <p className="text-xs text-gray-500">{t("cart.estimate")}</p>
            </>
          )}

          <div className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3">
            {ordering === "pickup" && (
              <fieldset className="flex flex-col gap-3" disabled={pending}>
                <legend className="mb-1 font-semibold">{t("pickup.title")}</legend>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${titleId}-name`} className="text-sm font-semibold">
                    {t("pickup.name")}
                  </label>
                  <input
                    id={`${titleId}-name`}
                    value={customer.name}
                    onChange={(event) => edit(() => setCustomer({ ...customer, name: event.target.value }))}
                    maxLength={60}
                    autoComplete="name"
                    aria-invalid={nameProblem ? true : undefined}
                    aria-describedby={nameProblem ? `${titleId}-name-error` : undefined}
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-base ${nameProblem ? "border-red-500" : "border-gray-300"}`}
                  />
                  {nameProblem && (
                    <p id={`${titleId}-name-error`} role="alert" className="text-sm text-red-700">
                      {t(`order.errors.${nameProblem}`)}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${titleId}-phone`} className="text-sm font-semibold">
                    {t("pickup.phone")}
                  </label>
                  {/* Phone numbers are always left-to-right, even on the Arabic page. */}
                  <input
                    id={`${titleId}-phone`}
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    value={customer.phone}
                    onChange={(event) => edit(() => setCustomer({ ...customer, phone: event.target.value }))}
                    maxLength={30}
                    autoComplete="tel"
                    placeholder="079 123 4567"
                    aria-invalid={phoneProblem ? true : undefined}
                    aria-describedby={phoneProblem ? `${titleId}-phone-error` : `${titleId}-phone-hint`}
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-base ${phoneProblem ? "border-red-500" : "border-gray-300"}`}
                  />
                  {phoneProblem ? (
                    <p id={`${titleId}-phone-error`} role="alert" className="text-sm text-red-700">
                      {t(`order.errors.${phoneProblem}`)}
                    </p>
                  ) : (
                    <p id={`${titleId}-phone-hint`} className="text-sm text-gray-600">
                      {t("pickup.phoneHint")}
                    </p>
                  )}
                </div>
              </fieldset>
            )}
            {ordering === "pickup" && (
              <p className="text-sm text-gray-600">
                {t("pickup.note")} {tableHint && t("pickup.tableHint")}
              </p>
            )}
            {ordering === "pickupOpen" && pickupName && (
              <p className="text-sm text-gray-600">
                <bdi>{t("pickup.openNote", { name: pickupName })}</bdi>
              </p>
            )}
            <button
              type="button"
              onClick={placeOrder}
              disabled={pending || blocked !== null || !priced.canCheckout}
              className="rounded-lg bg-gray-900 px-4 py-2.5 font-semibold text-white hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-gray-900"
              aria-describedby={`${titleId}-note`}
            >
              {pending ? t("cart.placing") : t("cart.placeOrder")}
            </button>
            <div id={`${titleId}-note`}>
              {blocked && <p className="text-sm text-gray-600">{blocked}</p>}
              {problem && !nameProblem && !phoneProblem && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {t(`order.errors.${problem}`)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
