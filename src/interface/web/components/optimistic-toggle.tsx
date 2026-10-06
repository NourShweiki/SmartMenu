"use client";

import { useOptimistic } from "react";

/**
 * An on/off button that flips IMMEDIATELY on click (optimistic UI) while the Server Action
 * saves in the background. When the page re-renders with the saved value it takes over; if
 * the action fails, React drops the optimistic value and the button shows the real state.
 */
export function OptimisticToggle({
  on,
  action,
  onLabel,
  offLabel,
  onClassName,
  offClassName,
}: {
  on: boolean;
  /** Receives the NEW value. */
  action: (next: boolean) => Promise<void>;
  /** Shown while on (so it usually describes how to turn it off). */
  onLabel: string;
  offLabel: string;
  onClassName: string;
  offClassName: string;
}) {
  const [optimisticOn, setOptimisticOn] = useOptimistic(on);
  return (
    <form
      action={async () => {
        const next = !optimisticOn;
        setOptimisticOn(next);
        await action(next);
      }}
    >
      <button type="submit" aria-pressed={optimisticOn} className={optimisticOn ? onClassName : offClassName}>
        {optimisticOn ? onLabel : offLabel}
      </button>
    </form>
  );
}
