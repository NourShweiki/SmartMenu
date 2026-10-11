/** Arabic-Indic (٠-٩) and Eastern Arabic (۰-۹) digits as Western ones: people type numbers on an Arabic keyboard. */
const westernDigits = (text: string): string =>
  text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

// With the country code (+962, 00962 or 962, and the stray 0 some people keep after it), or the local form with or
// without its leading 0. Mobile numbers start 77, 78 or 79 and have seven more digits.
const WITH_COUNTRY = /^(?:\+|00)?9620?(7[789]\d{7})$/;
const LOCAL = /^0?(7[789]\d{7})$/;

/**
 * A Jordanian mobile number as somebody typed it, in international form: `+9627XXXXXXXX` (data-model skill §9).
 * Spaces, dashes, dots and brackets are ignored. `null` when it is not a Jordanian mobile number. The database
 * accepts exactly this form for a pickup visit.
 */
export function normalizeJordanMobile(raw: string): string | null {
  const text = westernDigits(raw).replace(/[\s\-.()]/g, "");
  const national = WITH_COUNTRY.exec(text)?.[1] ?? LOCAL.exec(text)?.[1];
  return national ? `+962${national}` : null;
}
