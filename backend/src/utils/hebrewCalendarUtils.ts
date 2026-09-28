import { localDateToUtcMidnight } from "@/utils/DateUtils";

/**
 * Chol HaMoed day ranges (inclusive) by Hebrew month, per the Israeli
 * calendar (one festival day, not two as in the diaspora):
 * - Sukkot: 16–21 Tishri (21 = Hoshana Raba).
 * - Pesach: 16–20 Nisan.
 */
const CHOL_HAMOED_RANGES: Record<string, { from: number; to: number }> = {
  Tishri: { from: 16, to: 21 },
  Nisan: { from: 16, to: 20 },
};

// Month names come from ICU's Hebrew calendar. Formatting in UTC matches the
// UTC-midnight Date from localDateToUtcMidnight, so no day shift can happen.
const hebrewDateFormat = new Intl.DateTimeFormat("en-u-ca-hebrew", {
  timeZone: "UTC",
  month: "long",
  day: "numeric",
});

/**
 * Returns true when `localDate` (YYYY-MM-DD) falls on a Chol HaMoed day of
 * Sukkot or Pesach. Uses Node's built-in Hebrew calendar (Intl), so it works
 * for any year without a lookup table.
 *
 * Throws INVALID_DATE_FORMAT (via localDateToUtcMidnight) for a malformed date.
 */
export function isCholHamoed(localDate: string): boolean {
  const parts = hebrewDateFormat.formatToParts(localDateToUtcMidnight(localDate));
  const month = parts.find((p) => p.type === "month")?.value;
  const day = Number(parts.find((p) => p.type === "day")?.value);

  const range = month !== undefined ? CHOL_HAMOED_RANGES[month] : undefined;
  return range !== undefined && day >= range.from && day <= range.to;
}
