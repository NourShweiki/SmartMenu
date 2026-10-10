import { normalizeDecimal } from "./digits";

/**
 * Parses what an owner types into a percentage box ("16", "10.5", "١٦٫٥") into basis points
 * (1600 = 16%) using string/integer math only — no floats (data-model skill §3). At most 2
 * decimals, because that is the finest step basis points can express. Returns null for anything
 * else; the 0..100% range check stays in the domain (validateSettings).
 */
export function parseRateInput(raw: string): number | null {
  const normalized = normalizeDecimal(raw.trim().replace(/%$/, "").trim());
  const match = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(normalized);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** The reverse, for pre-filling the form: 1600 -> "16", 1050 -> "10.5", 1205 -> "12.05". */
export function bpToRateInput(bp: number): string {
  const whole = Math.floor(bp / 100);
  const fraction = String(bp % 100).padStart(2, "0").replace(/0$/, "");
  return fraction === "0" || fraction === "" ? String(whole) : `${whole}.${fraction}`;
}
