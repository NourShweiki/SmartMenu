"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import type { Cart } from "@/domain/cart/cart";
import { askAssistantAction } from "./assistant-actions";
import { distinctReasons, MAX_MESSAGE_CHARS, toHistory, type ChatEntry } from "./assistant-chat-model";
import type { AssistantOutcome } from "./assistant-model";

type Props = {
  cart: Cart;
  /** How many items the cart holds now (for the "view cart" button). */
  cartCount: number;
  /** Takes the cart the assistant returned: the customer's cart with the checked suggestions added. */
  onCartChange: (cart: Cart) => void;
  onViewCart: () => void;
};

/**
 * The AI ordering assistant: a button that opens a chat. The assistant only SUGGESTS: the server checks every line
 * against the live menu, and what is accepted lands in the cart like any other item. The customer still reviews the
 * cart and places the order themselves. Native <dialog>: focus trap + Esc for free.
 */
export function AssistantChat({ cart, cartCount, onCartChange, onViewCart }: Props) {
  const t = useTranslations("Menu.assistant");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

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

  const send = async () => {
    const text = draft.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!text || pending) return;
    const next: ChatEntry[] = [...entries, { role: "customer", text }];
    setEntries(next);
    setDraft("");
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

  return (
    <>
      {/* In the page flow (not floating): a floating button would cover the "Add" buttons of the menu on a phone. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full flex-col items-start gap-0.5 rounded-2xl bg-gray-900 px-5 py-4 text-start text-white hover:bg-gray-700"
      >
        <span className="font-semibold">{t("open")}</span>
        <span className="text-sm text-white/80">{t("hint")}</span>
      </button>

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
    </>
  );
}
