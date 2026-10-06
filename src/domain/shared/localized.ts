import type { LocalizedText } from "./result";

/** Restaurant content in the requested language, falling back to the other one if empty. */
export function localized(text: LocalizedText, lang: keyof LocalizedText): string {
  const value = text[lang].trim();
  return value || text[lang === "ar" ? "en" : "ar"].trim();
}
