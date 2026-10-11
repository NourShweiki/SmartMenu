"use client";

import { useFormStatus } from "react-dom";

/**
 * The submit button of a one-button form (a status step, a quick action): while the form's action runs it is
 * switched off and shows `pendingLabel`, so a second tap cannot send the same step twice.
 */
export function PendingSubmit({ children, pendingLabel, className }: { children: React.ReactNode; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
