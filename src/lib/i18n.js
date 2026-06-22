/**
 * Localization model. A project targets one or more locales (`state.locales`,
 * default ["en"]). The base locale ("en") lives in each screen's plain
 * `heading`/`subheading`; other locales live in `screen.i18n[code]`.
 *
 * Everything here is pure — no network, no React — so it's unit-testable and
 * safe to import anywhere.
 */

export const BASE_LOCALE = "en";

// Common App Store / Google Play languages. `code` is the project key; `name`
// is shown in the UI and sent to the translator.
export const LOCALES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt-BR", name: "Portuguese (Brazil)" },
  { code: "nl", name: "Dutch" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "fi", name: "Finnish" },
  { code: "no", name: "Norwegian" },
  { code: "pl", name: "Polish" },
  { code: "ru", name: "Russian" },
  { code: "tr", name: "Turkish" },
  { code: "ar", name: "Arabic" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "th", name: "Thai" },
  { code: "vi", name: "Vietnamese" },
  { code: "id", name: "Indonesian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh-Hans", name: "Chinese (Simplified)" },
  { code: "zh-Hant", name: "Chinese (Traditional)" },
];

const LOCALE_BY_CODE = Object.fromEntries(LOCALES.map((l) => [l.code, l]));

export function localeName(code) {
  return LOCALE_BY_CODE[code]?.name || code;
}

export function getLocale(code) {
  return LOCALE_BY_CODE[code] || null;
}

/** The project's target locales, always non-empty and base-first. */
export function projectLocales(state) {
  const list = Array.isArray(state?.locales) && state.locales.length ? state.locales : [BASE_LOCALE];
  return list.includes(BASE_LOCALE) ? list : [BASE_LOCALE, ...list];
}

/**
 * A screen with its heading/subheading resolved for `locale`. The base locale
 * (or a missing translation) returns the screen's plain text, so legacy
 * single-language projects are unaffected.
 */
export function localizeScreen(screen, locale, base = BASE_LOCALE) {
  if (!screen || !locale || locale === base) return screen;
  const t = screen.i18n?.[locale];
  if (!t) return screen;
  return {
    ...screen,
    heading: t.heading ?? screen.heading,
    subheading: t.subheading ?? screen.subheading,
  };
}

/** Immutably set a screen's text for `locale` (base writes the plain fields). */
export function setLocaleText(screen, locale, patch, base = BASE_LOCALE) {
  if (!locale || locale === base) return { ...screen, ...patch };
  const cur = screen.i18n?.[locale] || {};
  return { ...screen, i18n: { ...screen.i18n, [locale]: { ...cur, ...patch } } };
}

/** Ordered base strings to translate: [heading0, sub0, heading1, sub1, ...]. */
export function baseStrings(screens) {
  return screens.flatMap((s) => [s.heading || "", s.subheading || ""]);
}

/** Write a flat translated-string array back onto every screen for `locale`. */
export function applyLocaleStrings(screens, locale, strings, base = BASE_LOCALE) {
  if (locale === base) return screens;
  return screens.map((s, i) => {
    const heading = strings[i * 2] ?? "";
    // Don't invent a subheading where the base had none.
    const subheading = s.subheading ? strings[i * 2 + 1] ?? "" : "";
    return { ...s, i18n: { ...s.i18n, [locale]: { heading, subheading } } };
  });
}
