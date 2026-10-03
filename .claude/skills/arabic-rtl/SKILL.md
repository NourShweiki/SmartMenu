---
name: arabic-rtl
description: Arabic/English bilingual and RTL rules for SmartMenu UI and data. Use when building any screen, component, layout, form, translation string, number/price/date formatting, or bilingual field.
---

# Arabic + English / RTL rules (SmartMenu)

Arabic is a first-class language from day one, not a later add-on.

## Language and direction
- Locale is part of the URL: `/ar/...` and `/en/...`. Default for customers is the restaurant's `default_language` setting.
- Set `<html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>` at the root layout. Never set direction per component.
- UI strings live in message files (`messages/en.json`, `messages/ar.json`), via `next-intl`. No hard-coded user-facing text in components. Keys are added to BOTH files in the same change.
- Restaurant content (menu names, descriptions) comes from the `_en`/`_ar` columns, not from message files. Helper: `localized(text, locale)` falls back to the other language if one is empty.

## Layout (Tailwind)
- Use logical properties only: `ms-`/`me-` (not `ml-`/`mr-`), `ps-`/`pe-`, `start-`/`end-`, `text-start`/`text-end`, `rounded-s-`/`rounded-e-`, `border-s`/`border-e`.
- Flex/grid order flips automatically under `dir="rtl"`; don't reverse it manually.
- Directional icons (arrows, chevrons, back buttons) flip with `rtl:-scale-x-100`. Non-directional icons (search, cart, clock) don't flip.
- Never use absolute `left`/`right` positioning for layout.

## Numbers, prices, dates
- Use Western digits (0-9) in both languages unless the restaurant setting says otherwise — common in Jordan and easier for staff.
- Prices: format fils with `Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })` and the currency label ("JD" / "د.أ"). One shared `formatPrice(fils, locale)` helper; never format inline.
- Dates/times in `Asia/Amman` via `Intl.DateTimeFormat`.
- Phone numbers, order numbers and prices inside Arabic text: wrap in `<bdi>` or `dir="ltr"` span so they don't scramble.

## Typography
- Use a font with good Arabic support for `ar` (e.g. IBM Plex Sans Arabic, Cairo, or Noto Kufi Arabic) and keep line-height a bit larger for Arabic.
- Don't use `uppercase` or letter-spacing on Arabic text.

## Forms (owner portal)
- Bilingual fields are shown as a pair (English | العربية); the Arabic input has `dir="rtl"`.
- Validation messages are translated too.

## Checklist before finishing any UI change
1. Render it in both `/ar` and `/en`. Nothing overlaps or misaligns.
2. No `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right` classes added.
3. No hard-coded user-facing strings; both message files updated.
4. Prices go through `formatPrice`.
5. A Playwright test for the screen runs in both locales when an E2E test exists for it.
