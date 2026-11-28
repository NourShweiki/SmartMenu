"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { KITCHEN_UNDO_SECONDS } from "@/domain/order/kitchen-board";

type Button = "start" | "ready" | "pickedUp" | "served";

type Props = {
  /** The server action, already bound to the order and the tap. */
  action: () => Promise<void>;
  button: Button;
};

// Start, Ready and Picked up look different from a step away.
const TONE: Record<Button, string> = {
  start: "bg-gray-900 hover:bg-gray-700",
  ready: "bg-amber-600 hover:bg-amber-700",
  pickedUp: "bg-green-700 hover:bg-green-800",
  served: "bg-green-700 hover:bg-green-800",
};

/**
 * The one big button on a kitchen-screen ticket (PROJECT_SPEC.md §3.3). An order never goes back a step, so a tap is
 * NOT sent at once: for `KITCHEN_UNDO_SECONDS` the button turns into "Undo" with a countdown, and only then is the
 * step sent. Pressing Undo in that time sends nothing. Works with a finger and a mouse (a plain click, no long press
 * or swipe). While the step is on its way the button is switched off, so a second tap cannot send it twice.
 */
export function KitchenTapButton({ action, button }: Props) {
  const t = useTranslations("StaffKitchen.tap");
  const [left, setLeft] = useState<number | null>(null); // seconds until it is sent; null = not pressed
  const [pending, startTransition] = useTransition();

  // One second at a time while counting down.
  useEffect(() => {
    if (left === null || left <= 0) return;
    const timer = window.setTimeout(() => setLeft(left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);

  // At zero the step is sent, once.
  useEffect(() => {
    if (left !== 0) return;
    setLeft(null);
    startTransition(() => action());
  }, [left, action]);

  if (left !== null) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setLeft(null)}
          className="min-h-14 w-full rounded-xl border-2 border-gray-900 bg-white px-4 py-3 text-xl font-bold text-gray-900 hover:bg-gray-100"
        >
          {t("undo")}
        </button>
        <p role="status" className="text-center text-sm text-gray-600">
          {t("sendingIn", { label: t(button), seconds: left })}
        </p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setLeft(KITCHEN_UNDO_SECONDS)}
      disabled={pending}
      aria-busy={pending}
      className={`min-h-14 w-full rounded-xl px-4 py-3 text-xl font-bold text-white disabled:opacity-60 ${TONE[button]}`}
    >
      {pending ? t("working") : t(button)}
    </button>
  );
}
