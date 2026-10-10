/**
 * Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> 0-9, and the Arabic decimal mark "٫" / a decimal comma -> ".".
 * Owners type numbers on Arabic keyboards; every numeric input goes through this before parsing.
 */
export function normalizeDigits(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** normalizeDigits plus the decimal separators, for amounts and percentages. */
export function normalizeDecimal(raw: string): string {
  return normalizeDigits(raw).replace(/[٫,]/g, ".");
}
