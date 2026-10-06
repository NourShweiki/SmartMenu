/**
 * Parses what an owner types into a price box ("4.5", "4.500", "12", "٤٫٥") into whole fils
 * using string/integer math only — no floats (data-model skill §3). Returns null if it isn't
 * a plain JD amount with at most 3 decimals. Range checks stay in the domain (toFils).
 */
export function parsePriceInput(raw: string): number | null {
  const normalized = raw
    .trim()
    // Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> 0-9
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    // Arabic decimal separator "٫" and a comma typed as decimal point -> "."
    .replace(/[٫,]/g, ".");

  const match = /^(\d{1,7})(?:\.(\d{0,3}))?$/.exec(normalized);
  if (!match) return null;
  const jd = Number(match[1]);
  const fils = Number((match[2] ?? "").padEnd(3, "0"));
  return jd * 1000 + fils;
}

/** The reverse, for pre-filling the edit form: 4500 -> "4.500". */
export function filsToPriceInput(fils: number): string {
  return `${Math.floor(fils / 1000)}.${String(fils % 1000).padStart(3, "0")}`;
}
