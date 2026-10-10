"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import type { PricedCart, PricedLine } from "@/domain/cart/cart";
import { MAX_LINE_QUANTITY } from "@/domain/order/order";
import { localized } from "@/domain/shared/localized";
import { formatPrice } from "@/interface/web/format";
import type { Locale } from "@/interface/web/i18n/locales";

type Props = {
  open: boolean;
  priced: PricedCart;
  onClose: () => void;
  onSetQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
};

/** The cart as a modal sheet: lines, quantities, the price preview, and the note about when ordering opens. */
export function CartPanel({ open, priced, onClose, onSetQuantity, onRemove }: Props) {
  const t = useTranslations("Menu");
  const locale = useLocale() as Locale;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

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
              onClick={() => onSetQuantity(l.key, l.quantity - 1)}
              aria-label={`${t("decrease")}: ${l.item ? localized(l.item.name, locale) : ""}`}
              className="size-8 rounded-lg border border-gray-300"
            >
              −
            </button>
            <span className="min-w-6 text-center font-semibold" aria-live="polite">
              {l.quantity}
            </span>
            <button
              type="button"
              onClick={() => onSetQuantity(l.key, l.quantity + 1)}
              disabled={l.quantity >= MAX_LINE_QUANTITY}
              aria-label={`${t("increase")}: ${l.item ? localized(l.item.name, locale) : ""}`}
              className="size-8 rounded-lg border border-gray-300 disabled:opacity-40"
            >
              +
            </button>
          </div>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => onRemove(l.key)} className="text-sm text-gray-600 underline hover:text-gray-900">
          {t("cart.remove")}
        </button>
      </div>
    </li>
  );

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl p-0 shadow-xl backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <header className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-xl font-semibold">
            {t("cart.title")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("close")} className="rounded-lg px-2 py-1 text-xl leading-none text-gray-500 hover:bg-gray-100">
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
          <button
            type="button"
            disabled
            className="rounded-lg bg-gray-900 px-4 py-2.5 font-semibold text-white opacity-50"
            aria-describedby={`${titleId}-note`}
          >
            {t("cart.placeOrder")}
          </button>
          <p id={`${titleId}-note`} className="text-sm text-gray-600">
            {t("cart.checkoutSoon")}
          </p>
        </div>
      </div>
    </dialog>
  );
}
