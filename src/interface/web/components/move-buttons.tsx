"use client";

import { useFormStatus } from "react-dom";

function Arrow({ label, disabled, children }: { label: string; disabled: boolean; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      disabled={disabled || pending}
      className="flex size-8 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** ↑ / ↓ reorder buttons. Up/down mean the same in RTL and LTR, so the arrows never flip. */
export function MoveButtons({
  up,
  down,
  isFirst,
  isLast,
  upLabel,
  downLabel,
}: {
  up: () => Promise<void>;
  down: () => Promise<void>;
  isFirst: boolean;
  isLast: boolean;
  upLabel: string;
  downLabel: string;
}) {
  return (
    <div className="flex gap-1">
      <form action={up}>
        <Arrow label={upLabel} disabled={isFirst}>
          ↑
        </Arrow>
      </form>
      <form action={down}>
        <Arrow label={downLabel} disabled={isLast}>
          ↓
        </Arrow>
      </form>
    </div>
  );
}
