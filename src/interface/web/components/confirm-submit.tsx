"use client";

/**
 * A submit button that asks "are you sure?" first (for deletes). The question text comes from
 * the caller, already translated.
 */
export function ConfirmSubmit({
  question,
  children,
  className,
  disabled,
}: {
  question: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={className}
      onClick={(e) => {
        if (!window.confirm(question)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
