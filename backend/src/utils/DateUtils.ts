import { DateTime } from "luxon";
import { AppError } from "@/utils/AppError";

/**
 * Returns today's local date as a YYYY-MM-DD string in the given timezone.
 * This is what gets stored as `workDate` on a new daily record.
 */
export function getLocalDate(timezone: string): string {
  return DateTime.now().setZone(timezone).toFormat("yyyy-MM-dd");
}

/**
 * Converts a UTC Date (or ISO string) to a YYYY-MM-DD local date string
 * in the given timezone.
 */
export function utcToLocalDate(utc: Date | string, timezone: string): string {
  const dt =
    typeof utc === "string"
      ? DateTime.fromISO(utc, { zone: "utc" })
      : DateTime.fromJSDate(utc, { zone: "utc" });
  return dt.setZone(timezone).toFormat("yyyy-MM-dd");
}

/**
 * Converts a UTC Date (or ISO string) to an HH:mm local time string
 * in the given timezone.
 */
export function utcToLocalTime(utc: Date | string, timezone: string): string {
  const dt =
    typeof utc === "string"
      ? DateTime.fromISO(utc, { zone: "utc" })
      : DateTime.fromJSDate(utc, { zone: "utc" });
  return dt.setZone(timezone).toFormat("HH:mm");
}

/**
 * Resolves a `dd-mm` string to a `YYYY-MM-DD` date using the current year in
 * the user's timezone. Used by the `/edit dd-mm` and `/record dd-mm` flows.
 *
 * Example:
 *   resolveDdMmToDate("20-06", "Asia/Jerusalem")  → "2026-06-20"
 *
 * Throws `AppError("INVALID_DATE_FORMAT")` when the combination is not a real
 * calendar date (e.g. 31-02, 29-02 on a non-leap year).
 */
export function resolveDdMmToDate(ddMm: string, timezone: string): string {
  const year = DateTime.now().setZone(timezone).year;
  const [dd, mm] = ddMm.split("-").map(Number);
  const dt = DateTime.fromObject({ year, month: mm, day: dd }, { zone: timezone });
  if (!dt.isValid) {
    throw new AppError(
      "INVALID_DATE_FORMAT",
      `"${ddMm}" is not a valid calendar date (${dt.invalidReason ?? "invalid date"}).`
    );
  }
  return dt.toFormat("yyyy-MM-dd");
}

/**
 * Combines a local workDate (YYYY-MM-DD) and a time (HH:mm) in the given
 * timezone and returns a UTC Date. Used by the edit-day flow to store
 * start/end times anchored to the edited date, never the current date.
 *
 * Example:
 *   localTimeToUtc("2026-06-12", "17:30", "Asia/Jerusalem")
 *   → 2026-06-12T14:30:00.000Z  (UTC, accounting for UTC+3)
 */
export function localTimeToUtc(workDate: string, time: string, timezone: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return DateTime.fromISO(workDate, { zone: timezone })
    .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 })
    .toUTC()
    .toJSDate();
}

/**
 * Combines a local workDate (YYYY-MM-DD) and a manualEndTime (HH:mm) in the
 * given timezone and returns a UTC Date.
 *
 * Used when closing a previous unfinished workday: the end time is applied to
 * the original workDate in the user's timezone, never to the current date.
 *
 * Example:
 *   workDate = "2026-06-12", manualEndTime = "17:30", timezone = "Asia/Jerusalem"
 *   → 2026-06-12T14:30:00.000Z  (UTC, accounting for UTC+3)
 */
export function manualEndTimeToUtc(
  workDate: string,
  manualEndTime: string,
  timezone: string
): Date {
  const [hours, minutes] = manualEndTime.split(":").map(Number);
  const dt = DateTime.fromISO(workDate, { zone: timezone }).set({
    hour: hours,
    minute: minutes,
    second: 0,
    millisecond: 0,
  });
  return dt.toUTC().toJSDate();
}

/**
 * Returns a new UTC Date that is `minutes` after the given UTC base date.
 * Used to calculate expectedEndTime from startTime + dailyRequiredMinutes.
 */
export function addMinutesUtc(base: Date, minutes: number): Date {
  return DateTime.fromJSDate(base, { zone: "utc" })
    .plus({ minutes })
    .toJSDate();
}

/**
 * Returns the number of whole minutes between two UTC dates (end - start).
 * Result is always >= 0 (clamped).
 */
export function minutesBetween(start: Date, end: Date): number {
  const diff = DateTime.fromJSDate(end, { zone: "utc" }).diff(
    DateTime.fromJSDate(start, { zone: "utc" }),
    "minutes"
  );
  return Math.max(0, Math.floor(diff.minutes));
}
