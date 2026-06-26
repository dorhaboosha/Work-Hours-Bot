import i18next from "i18next";
import type { Weekday } from "@shared/types/CoreTypes";
import botLabels from "@/lang/botLabels.json";
import he from "@/lang/he.json";

const i18n = i18next.createInstance();

i18n.init({
  resources: {
    en: { translation: botLabels },
    he: { translation: he },
  },
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

/**
 * Returns a label string for the given key.
 * Interpolation variables are passed as `vars` (matching `{{varName}}` placeholders in JSON).
 * `lang` is kept as a parameter for compatibility during the cleanup; it will always be "en" in V1.1.
 */
export function t(key: string, lang: string, vars?: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (i18n.t as any)(key, { lng: lang, ...vars });
}

/**
 * Formats an array of weekday numbers into a comma-separated English string.
 */
export function formatWorkdays(workdays: Weekday[], lang: string): string {
  return workdays.map((d) => t(`weekday.${d}`, lang)).join(", ");
}

export { i18n };
