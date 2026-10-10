"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import type { CustomerMenuItem } from "@/application/use-cases/get-public-menu";
import { MAX_LINE_QUANTITY } from "@/domain/order/order";
import { priceWithOptions, validateSelection, type MenuOption, type OptionGroup, type OptionId } from "@/domain/menu/options";
import { localized } from "@/domain/shared/localized";
import type { Fils } from "@/domain/shared/money";
import { formatPrice } from "@/interface/web/format";
import type { Locale } from "@/interface/web/i18n/locales";

type Props = {
  /** The item being customised; null = closed. */
  entry: CustomerMenuItem | null;
  onClose: () => void;
  /** Returns null when added, or the reason it could not be (shown inside the dialog). */
  onAdd: (optionIds: OptionId[], quantity: number) => string | null;
};

/** The "choose size, extras ..." sheet for an item that has option groups. Native <dialog>: focus trap + Esc for free. */
export function OptionPicker({ entry, onClose, onAdd }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (entry && !dialog.open) dialog.showModal();
    if (!entry && dialog.open) dialog.close();
  }, [entry]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl p-0 shadow-xl backdrop:bg-black/50"
    >
      {/* key: a fresh state (nothing chosen, quantity 1) every time a different item is opened */}
      {entry && <PickerBody key={entry.item.id} entry={entry} onClose={onClose} onAdd={onAdd} />}
    </dialog>
  );
}

function PickerBody({ entry, onClose, onAdd }: { entry: CustomerMenuItem; onClose: () => void; onAdd: Props["onAdd"] }) {
  const t = useTranslations("Menu");
  const locale = useLocale() as Locale;
  const titleId = useId();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [problem, setProblem] = useState<string | null>(null);

  const picks = (group: OptionGroup) => selected[group.id] ?? [];
  const statuses = entry.groups.map(({ group, options }) => validateSelection(group, options, picks(group)));
  const complete = statuses.every((s) => s.ok);
  const chosen: MenuOption[] = statuses.flatMap((s) => (s.ok ? s.value : []));
  const unit = priceWithOptions(entry.item.priceFils, chosen);
  const total = (unit * quantity) as Fils;

  const toggle = (group: OptionGroup, optionId: string) =>
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.maxSelect === 1) return { ...prev, [group.id]: optionId === "" ? [] : [optionId] }; // radio
      return { ...prev, [group.id]: current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId] };
    });

  const rule = (group: OptionGroup) =>
    group.minSelect === 0
      ? group.maxSelect === 1
        ? t("rule.optional")
        : t("rule.optionalUpTo", { max: group.maxSelect })
      : group.minSelect === group.maxSelect
        ? t("rule.exactly", { count: group.minSelect })
        : t("rule.range", { min: group.minSelect, max: group.maxSelect });

  return (
    <form
      method="dialog"
      onSubmit={(e) => {
        e.preventDefault();
        if (!complete) return;
        setProblem(onAdd(chosen.map((o) => o.id), quantity));
      }}
      aria-labelledby={titleId}
      className="flex flex-col gap-5 p-5"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-xl font-semibold">
            {localized(entry.item.name, locale)}
          </h2>
          <p className="text-sm text-gray-600">
            <bdi>{formatPrice(entry.item.priceFils, locale)}</bdi>
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label={t("close")} className="rounded-lg px-2 py-1 text-xl leading-none text-gray-500 hover:bg-gray-100">
          ×
        </button>
      </header>

      {entry.groups.map(({ group, options }, index) => {
        const radio = group.maxSelect === 1;
        const atMax = !radio && picks(group).length >= group.maxSelect;
        return (
          <fieldset key={group.id} className="flex flex-col gap-2">
            <legend className="mb-1 flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">{localized(group.name, locale)}</span>
              <span className="text-sm text-gray-500">{rule(group)}</span>
            </legend>
            {radio && group.minSelect === 0 && (
              <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 has-[:checked]:border-gray-900 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gray-900">
                <input type="radio" name={`group-${group.id}`} checked={picks(group).length === 0} onChange={() => toggle(group, "")} />
                <span>{t("none")}</span>
              </label>
            )}
            {options.map((option) => {
              const checked = picks(group).includes(option.id);
              return (
                <label
                  key={option.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 has-[:checked]:border-gray-900 has-[:disabled]:opacity-50 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gray-900"
                >
                  <input
                    type={radio ? "radio" : "checkbox"}
                    name={`group-${group.id}`}
                    checked={checked}
                    disabled={!radio && !checked && atMax}
                    onChange={() => toggle(group, option.id)}
                  />
                  <span className="flex-1">{localized(option.name, locale)}</span>
                  {option.priceDeltaFils > 0 && (
                    <span className="text-sm text-gray-600">
                      <bdi>+{formatPrice(option.priceDeltaFils, locale)}</bdi>
                    </span>
                  )}
                </label>
              );
            })}
            {!statuses[index]!.ok && <p className="text-sm text-gray-500">{t("completeChoices")}</p>}
          </fieldset>
        );
      })}

      {problem && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {problem}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2" role="group" aria-label={t("quantity")}>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            aria-label={t("decrease")}
            className="size-9 rounded-lg border border-gray-300 text-lg disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-8 text-center font-semibold" aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(MAX_LINE_QUANTITY, q + 1))}
            disabled={quantity >= MAX_LINE_QUANTITY}
            aria-label={t("increase")}
            className="size-9 rounded-lg border border-gray-300 text-lg disabled:opacity-40"
          >
            +
          </button>
        </div>
        <button
          type="submit"
          disabled={!complete}
          className="flex-1 rounded-lg bg-gray-900 px-4 py-2.5 font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("addToCart")} · <bdi>{formatPrice(total, locale)}</bdi>
        </button>
      </div>
    </form>
  );
}
