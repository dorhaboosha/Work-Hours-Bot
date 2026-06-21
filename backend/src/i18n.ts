import i18next from "i18next";
import type { LanguageCode, Weekday } from "@shared/types/CoreTypes";
import en from "@/lang/en.json";
import he from "@/lang/he.json";

const i18n = i18next.createInstance();

i18n.init({
  resources: {
    en: { translation: en },
    he: { translation: he },
  },
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

/**
 * Returns a translation string for the given key and language.
 * Interpolation variables are passed as `vars` (matching `{{varName}}` placeholders in JSON).
 */
export function t(key: string, lang: LanguageCode, vars?: Record<string, unknown>): string {
  // Cast to any to bypass i18next's strict overload union — our wrapper is typed correctly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (i18n.t as any)(key, { lng: lang, ...vars });
}

/**
 * Formats an array of weekday numbers into a comma-separated localized string.
 */
export function formatWorkdays(workdays: Weekday[], lang: LanguageCode): string {
  return workdays.map((d) => t(`weekday.${d}`, lang)).join(", ");
}

export { i18n };
