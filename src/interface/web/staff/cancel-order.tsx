"use client";

import { useId, useState } from "react";
import { PendingSubmit } from "@/interface/web/components/pending-submit";

type Props = {
  /** The server action, already bound to the order: it reads the chosen `reason` from the form. */
  action: (form: FormData) => Promise<void>;
  /** Reason value -> its translated text, in the order to show them. */
  reasons: readonly { value: string; label: string }[];
  labels: { open: string; reason: string; confirm: string; keep: string; working: string };
};

/**
 * "Cancel order" on an order card. Two deliberate steps instead of an "are you sure?" box: the first press only
 * opens a small form, where the member of staff has to pick WHY (the reason is kept with the order) before the
 * second press cancels. "Keep the order" closes it again.
 */
export function CancelOrder({ action, reasons, labels }: Props) {
  const [open, setOpen] = useState(false);
  const reasonId = useId();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-end text-sm text-red-700 underline hover:text-red-900">
        {labels.open}
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl bg-red-50 p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={reasonId} className="text-sm font-semibold text-red-900">
          {labels.reason}
        </label>
        <select id={reasonId} name="reason" required defaultValue="" className="rounded-lg border border-red-200 bg-white px-3 py-2">
          <option value="" disabled>
            —
          </option>
          {reasons.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-100">
          {labels.keep}
        </button>
        <PendingSubmit pendingLabel={labels.working} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
          {labels.confirm}
        </PendingSubmit>
      </div>
    </form>
  );
}
