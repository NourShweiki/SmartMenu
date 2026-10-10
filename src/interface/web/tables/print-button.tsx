"use client";

import { useTranslations } from "next-intl";

/** Opens the browser's print dialog. Hidden on paper itself (the cards are what gets printed). */
export function PrintButton() {
  const t = useTranslations("Tables");
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-gray-900 px-5 py-2.5 font-semibold text-white hover:bg-gray-700 print:hidden"
    >
      {t("printButton")}
    </button>
  );
}
