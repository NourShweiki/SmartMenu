"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import type { Cart } from "@/domain/cart/cart";
import { askAssistantAction } from "./assistant-actions";
import { categorySuggestions, distinctReasons, MAX_MESSAGE_CHARS, toHistory, type ChatEntry } from "./assistant-chat-model";
import type { AssistantOutcome } from "./assistant-model";

type Props = {
  /** The menu's category names in the guest's language: they become "What do you have in ...?" suggestions. */
  categories: readonly string[];
  cart: Cart;
  /** How many items the cart holds now (for the "view cart" button). */
  cartCount: number;
  /** Takes the cart the assistant returned: the customer's cart with the checked suggestions added. */
  onCartChange: (cart: Cart) => void;
  onViewCart: () => void;
};

/**
 * The AI ordering assistant's chat. It is NOT part of the plain menu: the home page's "Smart assistant" card opens the
 * menu page with `?assistant=1`, and this chat opens at once (the address is then cleaned, so a reload shows the plain
 * menu). It only SUGGESTS: the server checks every line against the live menu, and what is accepted lands in the cart
 * like any other item. The customer still reviews the cart and places the order themselves. Under the messages sit
 * ready-made suggestions: one tap sends the question, so nobody has to type to get started. Native <dialog>: focus
 * trap + Esc for free.
 */
export function AssistantChat({ categories, cart, cartCount, onCartChange, onViewCart }: Props) {
  const t = useTranslations("Menu.assistant");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(true);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  // Take the "?assistant=1" out of the address (without a reload): the chat is open now, and a reload is the plain menu.
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [entries, pending]);

  /** Sends what was typed, or a suggestion that was tapped (the same as typing it). */
  const send = async (suggestion?: string) => {
    const text = (suggestion ?? draft).trim().slice(0, MAX_MESSAGE_CHARS);
    if (!text || pending) return;
    const next: ChatEntry[] = [...entries, { role: "customer", text }];
    setEntries(next);
    if (suggestion === undefined) setDraft("");
    setPending(true);

    let outcome: AssistantOutcome;
    try {
      outcome = await askAssistantAction(toHistory(next), cart);
    } catch {
      outcome = { ok: false, problem: "failed" }; // no connection, or the reply never arrived
    }
    setPending(false);

    if (!outcome.ok) {
      setEntries((current) => [...current, { role: "note", text: t(`errors.${outcome.problem}`) }]);
      return;
    }
    const added: ChatEntry[] = outcome.message ? [{ role: "assistant", text: outcome.message }] : [];
    if (outcome.added > 0) {
      onCartChange(outcome.cart);
      added.push({ role: "note", text: t("addedToCart", { count: outcome.added }) });
    }
    for (const reason of distinctReasons(outcome.rejected)) added.push({ role: "note", text: t(`rejected.${reason}`) });
    setEntries((current) => [...current, ...added]);
  };

  const suggestions = [t("suggestions.recommend"), t("suggestions.cheapest"), t("suggestions.forTwo"), ...categorySuggestions(categories).map((name) => t("suggestions.category", { name }))];

  return (
    <dialog
      ref={dialogRef}
      onClose={() => setOpen(false)}
      aria-labelledby={titleId}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-hidden rounded-2xl p-0 shadow-xl backdrop:bg-black/50"
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 p-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {t("title")}
          </h2>
          <div className="flex items-center gap-2">
            {cartCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onViewCart();
                }}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold hover:bg-gray-100"
              >
                {t("viewCart")}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label={t("close")} className="rounded-lg px-2 py-1 text-xl leading-none text-gray-500 hover:bg-gray-100">
              ×
            </button>
          </div>
        </header>

        <div ref={listRef} className="flex min-h-40 flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
          {entries.length === 0 && <p className="text-sm text-gray-600">{t("intro")}</p>}
          {entries.map((entry, i) =>
            entry.role === "note" ? (
              <p key={i} className="mx-auto max-w-[90%] rounded-lg bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-900">
                {entry.text}
              </p>
            ) : (
              // Plain text only (never HTML): what the AI writes is not trusted markup.
              <p
                key={i}
                dir="auto"
                className={
                  entry.role === "customer"
                    ? "ms-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-gray-900 px-4 py-2 text-white"
                    : "me-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-gray-100 px-4 py-2"
                }
              >
                {entry.text}
              </p>
            ),
          )}
          {pending && (
            <p role="status" className="me-auto rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-600">
              {t("thinking")}
            </p>
          )}
        </div>

        {/* Ready-made questions: one tap sends one. A row that scrolls sideways, so many of them never push the chat up. */}
        <div role="group" aria-label={t("suggestions.label")} className="flex gap-2 overflow-x-auto border-t border-gray-100 px-3 py-2">
          {suggestions.map((text) => (
            <button
              key={text}
              type="button"
              disabled={pending}
              onClick={() => void send(text)}
              className="shrink-0 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {text}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-center gap-2 border-t border-gray-200 p-3"
        >
          <input
            type="text"
            dir="auto"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_MESSAGE_CHARS}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={pending || draft.trim() === ""}
            className="rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("send")}
          </button>
        </form>
      </div>
    </dialog>
  );
}
