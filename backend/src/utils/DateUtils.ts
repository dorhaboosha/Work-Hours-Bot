import { DateTime } from "luxon";

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
