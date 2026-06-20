import type { LanguageCode, Weekday } from "@shared/types/CoreTypes";
import type { MessageCatalog } from "@/localization/MessageCatalog";
import en from "@/localization/catalogs/en";
import he from "@/localization/catalogs/he";

const CATALOGS: Record<LanguageCode, MessageCatalog> = { en, he };

/**
 * Returns the message catalog for the given language.
 * Falls back to English for any unknown language code.
 */
export function t(lang: LanguageCode): MessageCatalog {
  return CATALOGS[lang] ?? CATALOGS.en;
}

/**
 * Formats an array of weekday numbers into a localised comma-separated string
 * using the catalog's weekday names.
 *
 * Examples (en): [0,1,2,3,4] → "Sunday, Monday, Tuesday, Wednesday, Thursday"
 * Examples (he): [0,1,2,3,4] → "ראשון, שני, שלישי, רביעי, חמישי"
 */
export function formatWorkdays(workdays: Weekday[], lang: LanguageCode): string {
  const names = t(lang).weekdayNames;
  return workdays.map((d) => names[d]).join(", ");
}
